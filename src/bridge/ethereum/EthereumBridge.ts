import type {
  BridgeDepositOptions,
  BridgeInterface,
} from "@/bridge/types/BridgeInterface";
import {
  type Address,
  Amount,
  type BridgeDepositFeeEstimation,
  type EthereumAddress,
  EthereumBridgeToken,
  type ExternalTransactionResponse,
} from "@/types";
import {
  type EthereumTokenInterface,
  intoEthereumToken,
} from "@/bridge/ethereum/EtherToken";
import {
  type ApprovalFeeEstimation,
  type EthereumTransactionDetails,
  type EthereumWalletConfig,
} from "@/bridge/ethereum/types";
import type { InterfaceAbi } from "ethers";
import {
  Contract,
  getAddress,
  type ContractTransaction,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  isError,
  type TransactionRequest,
} from "ethers";
import { FeeErrorCause, TransactionErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import CANONICAL_BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";
import { fromEthereumAddress } from "@/connect/ethersRuntime";

export abstract class EthereumBridge implements BridgeInterface<EthereumAddress> {
  public static readonly ALLOWANCE_CACHE_TTL = 60_000;
  public static readonly GAS_LIMIT_SAFE_MULTIPLIER = 1.5;

  private allowanceCache: {
    current: Amount | null;
    timestamp: number;
  };
  protected readonly token: EthereumTokenInterface;
  protected readonly bridge: Contract;

  constructor(
    protected readonly bridgeToken: EthereumBridgeToken,
    protected readonly config: EthereumWalletConfig,
    readonly starknetWallet: WalletInterface,
    bridgeAbi: InterfaceAbi = CANONICAL_BRIDGE_ABI
  ) {
    this.allowanceCache = {
      current: null,
      timestamp: 0,
    };
    this.token = intoEthereumToken(bridgeToken, config);
    this.bridge = new Contract(
      bridgeToken.bridgeAddress,
      bridgeAbi,
      config.signer
    );
  }

  abstract deposit(
    recipient: Address,
    amount: Amount,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse>;

  abstract getDepositFeeEstimate(
    _options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation>;

  async getAvailableDepositBalance(account: EthereumAddress): Promise<Amount> {
    return this.token.balanceOf(account);
  }

  async getAllowance(): Promise<Amount | null> {
    const allowanceSpender = await this.getAllowanceSpender();
    if (!allowanceSpender) {
      return null;
    }

    if (
      Date.now() - this.allowanceCache.timestamp >
      EthereumBridge.ALLOWANCE_CACHE_TTL
    ) {
      const signerAddress = await this.config.signer.getAddress();
      const allowance = await this.token.allowance(
        fromEthereumAddress(signerAddress, { getAddress }),
        allowanceSpender
      );
      this.setCachedAllowance(allowance);
    }

    return this.allowanceCache.current;
  }

  protected abstract getAllowanceSpender(): Promise<EthereumAddress | null>;

  protected async getEthereumGasPrice(): Promise<bigint> {
    const gasData = await this.config.provider.getFeeData();
    const gasPrice = gasData.gasPrice ?? 0n;
    const maxFeePerGas = gasData.maxFeePerGas;
    return maxFeePerGas && gasData.maxPriorityFeePerGas
      ? maxFeePerGas
      : gasPrice;
  }

  protected async approveSpendingOf(amount: Amount): Promise<void> {
    const spender = await this.getAllowanceSpender();
    if (!spender) {
      return;
    }

    const allowance = await this.getAllowance();
    if (!allowance) {
      return;
    }

    if (!allowance.lt(amount)) {
      return;
    }

    const tx = await this.token.approve(spender, amount, this.config.signer);
    if (!tx) {
      return;
    }

    const response = await this.execute(tx);
    const receipt = await response.wait();
    if (!receipt?.status) {
      throw new Error(TransactionErrorCause.APPROVE_FAILED);
    }

    await this.updateAllowanceFromReceipt(receipt);
  }

  protected async execute(
    tx: TransactionRequest
  ): Promise<ContractTransactionResponse> {
    try {
      return (await this.config.signer.sendTransaction(
        tx
      )) as ContractTransactionResponse;
    } catch (e) {
      if (isError(e, "ACTION_REJECTED")) {
        throw new Error(TransactionErrorCause.USER_REJECTED);
      }

      if (isError(e, "INSUFFICIENT_FUNDS")) {
        throw new Error(TransactionErrorCause.INSUFFICIENT_BALANCE);
      }

      // TODO be more specific with other ethers errors
      throw e;
    }
  }

  protected async populateTransaction(
    details: EthereumTransactionDetails
  ): Promise<ContractTransaction> {
    return await this.bridge
      .getFunction(details.method)
      .populateTransaction(...details.args, details.transaction);
  }

  protected ethAmount(value: bigint): Amount {
    return Amount.fromRaw(value, 18, "ETH");
  }

  protected async estimateApprovalFee(): Promise<ApprovalFeeEstimation> {
    if (this.token.isNativeEth()) {
      return { approvalFee: this.ethAmount(0n) };
    }

    const spender = await this.getAllowanceSpender();
    if (!spender) {
      return { approvalFee: this.ethAmount(0n) };
    }

    const contract = this.token.getContract();
    if (!contract) {
      return {
        approvalFee: this.ethAmount(0n),
        approvalFeeError: FeeErrorCause.NO_TOKEN_CONTRACT,
      };
    }

    try {
      const approvalTransaction = await this.token.approve(
        spender,
        await this.token.amount(1n),
        this.config.signer
      );
      if (!approvalTransaction) {
        return {
          approvalFee: this.ethAmount(0n),
          approvalFeeError: FeeErrorCause.NO_TOKEN_CONTRACT,
        };
      }

      const from = await this.config.signer.getAddress();
      const [approvalGasRequirement, gasPrice] = await Promise.all([
        this.config.provider.estimateGas({ ...approvalTransaction, from }),
        this.getEthereumGasPrice(),
      ]);

      const approvalFee: bigint = approvalGasRequirement * gasPrice;
      return { approvalFee: this.ethAmount(approvalFee) };
    } catch {
      return {
        approvalFee: this.ethAmount(0n),
        approvalFeeError: FeeErrorCause.APPROVAL_FEE_ERROR,
      };
    }
  }

  protected clearCachedAllowance() {
    this.allowanceCache.timestamp = -1;
  }

  private setCachedAllowance(newValue: Amount | null) {
    this.allowanceCache = {
      current: newValue,
      timestamp: Date.now(),
    };
  }

  private async updateAllowanceFromReceipt(
    receipt: ContractTransactionReceipt
  ) {
    const tokenInterface = this.token.getContract()?.interface;
    if (!tokenInterface || !receipt.logs) return;

    let newAllowance: bigint | null = null;
    for (const log of receipt.logs) {
      let parsedLog;
      try {
        parsedLog = tokenInterface.parseLog(log);
      } catch {
        continue;
      }

      if (
        parsedLog?.name === "Approval" &&
        typeof parsedLog.args?.value === "bigint"
      ) {
        newAllowance = parsedLog.args.value;
        break;
      }
    }

    if (newAllowance !== null) {
      const amount = await this.token.amount(newAllowance);
      this.setCachedAllowance(amount);
    } else {
      this.clearCachedAllowance();
    }
  }
}
