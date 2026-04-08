import type {
  BridgeDepositOptions,
  BridgeInterface,
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import {
  type Address,
  Amount,
  type BridgeDepositFeeEstimation,
  type EthereumAddress,
  EthereumBridgeToken,
  type ExternalAddress,
  type ExternalTransactionResponse,
} from "@/types";
import {
  type EthereumTokenInterface,
  intoEthereumToken,
} from "@/bridge/ethereum/EtherToken";
import {
  type ApprovalFeeEstimation,
  type EthereumCompleteWithdrawFeeEstimation,
  type EthereumTransactionDetails,
  type EthereumWalletConfig,
} from "@/bridge/ethereum/types";
import type { InterfaceAbi } from "ethers";
import {
  Contract,
  type ContractTransaction,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  getAddress,
  isError,
  toBigInt,
  type TransactionRequest,
} from "ethers";
import { FeeErrorCause, TransactionErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import type { Tx } from "@/tx";
import CANONICAL_BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import { type Call, CallData, uint256 } from "starknet";
import { Erc20 } from "@/erc20";
import { type StarkZapLogger } from "@/logger";

export abstract class EthereumBridge implements BridgeInterface<EthereumAddress> {
  public static readonly ALLOWANCE_CACHE_TTL = 60_000;
  public static readonly GAS_LIMIT_SAFE_MULTIPLIER = 1.5;

  private allowanceCache: {
    current: Amount | null;
    timestamp: number;
  };
  protected readonly token: EthereumTokenInterface;
  protected readonly starknetToken: Erc20;
  protected readonly bridge: Contract;

  constructor(
    protected readonly bridgeToken: EthereumBridgeToken,
    protected readonly config: EthereumWalletConfig,
    readonly starknetWallet: WalletInterface,
    protected readonly logger: StarkZapLogger,
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
    this.starknetToken = new Erc20(
      bridgeToken.intoStarknetToken(),
      starknetWallet.getProvider()
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

  /**
   * Initiate a withdrawal from Starknet to Ethereum by calling
   * `initiate_token_withdraw` on the L2 bridge contract.
   *
   * The `ExecuteOptions` portion of `options` is forwarded to
   * `starknetWallet.execute` unchanged; the bridge-internal `fastTransfer`
   * flag is consumed by protocol-specific overrides (e.g. CCTP fee tier)
   * and does not affect the Starknet transaction itself.
   */
  async initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    const call = this.buildInitiateWithdrawCall(recipient.toString(), amount);
    return this.starknetWallet.execute([call], options);
  }

  async getAvailableWithdrawBalance(account: Address): Promise<Amount> {
    return await this.starknetToken.balanceOf(account);
  }

  async completeWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    _options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse> {
    const details = await this.buildCompleteWithdrawCall(recipient, amount);
    const tx = await this.populateTransaction(details);
    const gasLimit = await this.estimateEthereumSafeGasLimitForTx(tx);
    const response = await this.execute({ ...tx, gasLimit });
    return { hash: response.hash };
  }

  async getCompleteWithdrawFeeEstimate(
    amount: Amount,
    recipient: ExternalAddress,
    _options?: CompleteBridgeWithdrawOptions
  ): Promise<EthereumCompleteWithdrawFeeEstimation> {
    try {
      const details = await this.buildCompleteWithdrawCall(recipient, amount);
      const tx = await this.populateTransaction(details);
      const [gasUnits, gasPrice] = await Promise.all([
        this.config.provider.estimateGas(tx),
        this.getEthereumGasPrice(),
      ]);
      return { l1Fee: this.ethAmount(gasUnits * gasPrice) };
    } catch {
      return {
        l1Fee: this.ethAmount(0n),
        l1FeeError: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  protected abstract getAllowanceSpender(): Promise<EthereumAddress | null>;

  protected async getEthereumGasPrice(): Promise<bigint> {
    const gasData = await this.config.provider.getFeeData();
    const maxFeePerGas = gasData.maxFeePerGas;
    return maxFeePerGas != null && gasData.maxPriorityFeePerGas != null
      ? maxFeePerGas
      : (gasData.gasPrice ?? 0n);
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

  protected async estimateEthereumSafeGasLimitForTx(
    tx: ContractTransaction
  ): Promise<bigint> {
    const estimated = await this.config.provider.estimateGas(tx);
    return (
      (estimated *
        toBigInt(Math.ceil(EthereumBridge.GAS_LIMIT_SAFE_MULTIPLIER * 100))) /
      100n
    );
  }

  protected clearCachedAllowance() {
    this.allowanceCache.timestamp = -1;
  }

  protected buildInitiateWithdrawCall(recipient: string, amount: Amount): Call {
    return {
      contractAddress: this.bridgeToken.starknetBridge.toString(),
      entrypoint: "initiate_token_withdraw",
      calldata: CallData.compile({
        l1Token: this.bridgeToken.address.toString(),
        l1Recipient: recipient,
        amount: uint256.bnToUint256(amount.toBase()),
      }),
    };
  }

  protected async buildCompleteWithdrawCall(
    recipient: ExternalAddress,
    amount: Amount
  ): Promise<EthereumTransactionDetails> {
    return {
      method: "withdraw(address,uint256,address)",
      args: [
        this.bridgeToken.address.toString(),
        amount.toBase().toString(),
        recipient.toString(),
      ],
      transaction: {
        from: await this.config.signer.getAddress(),
      },
    };
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
