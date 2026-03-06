import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  fromEthereumAddress,
} from "@/types";
import type { EthereumTokenInterface } from "@/bridge/ethereum/EthereumToken";
import {
  ethereumAddress,
  type EthereumTransactionDetails,
  type EthereumWalletConfig,
} from "@/bridge/ethereum/types";
import {
  Contract,
  type ContractTransaction,
  ContractTransactionReceipt,
  type ContractTransactionResponse,
  isError,
  toBigInt,
} from "ethers";
import {
  StarkzapTransactionError,
  TransactionErrorCause,
} from "@/types/errors";
import { type PRICE_UNIT, RPC, uint256 } from "starknet";
import type { WalletInterface } from "@/wallet";
import BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";

export abstract class EthereumBridge implements BridgeInterface<EthereumBridgeToken> {
  public static readonly ALLOWANCE_CACHE_TTL = 60_000;
  public static readonly GAS_LIMIT_SAFE_MULTIPLIER = 1.5;

  private allowanceCache: {
    current: Amount | null;
    timestamp: number;
  };
  private readonly token: EthereumTokenInterface;
  protected readonly bridge: Contract;

  constructor(
    private readonly bridgeToken: EthereumBridgeToken,
    private readonly config: EthereumWalletConfig,
    readonly starknetWallet: WalletInterface
  ) {
    this.allowanceCache = {
      current: null,
      timestamp: 0,
    };
    this.token = bridgeToken.asEthereumToken(config.provider);
    this.bridge = new Contract(
      bridgeToken.bridgeAddress,
      BRIDGE_ABI,
      config.signer
    );
  }

  async deposit(
    recipient: Address,
    amount: Amount
  ): Promise<ContractTransactionResponse> {
    // In case that the token is an erc20, we need to approve the allowance
    await this.approveSpendingOf(amount);

    const transactionDetails = await this.prepareDepositTransactionDetails(
      recipient,
      amount
    );
    // Calculate the gas limit with some added for safety
    const safeGasLimit = await this.getSafeGasLimitValue(transactionDetails);
    const preparedTransaction = await this.prepareTransaction(
      transactionDetails,
      safeGasLimit
    );

    const response = await this.execute(preparedTransaction);

    this.clearCachedAllowance();

    return response;
  }

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
        fromEthereumAddress(signerAddress),
        allowanceSpender
      );

      this.setCachedAllowance(allowance);
    }

    return this.allowanceCache.current;
  }

  //// PROTECTED
  protected async approveSpendingOf(amount: Amount): Promise<void> {
    const spender = await this.getAllowanceSpender();
    if (!spender) {
      return;
    }

    const allowance = await this.getAllowance();
    if (!allowance) {
      console.log("No approve needed");
      return;
    }

    if (allowance.lt(amount)) {
      // Send TX
      const tx = await this.getApprovalTransaction(spender, amount);
      if (!tx) {
        return;
      }

      const response = await this.execute(tx);
      const receipt = await response.wait();
      if (!receipt?.status) {
        throw new StarkzapTransactionError(
          TransactionErrorCause.APPROVE_FAILED
        );
      }

      await this.updateAllowanceFromReceipt(receipt);
    } else {
      console.log("No approve needed");
    }
  }

  protected async getApprovalTransaction(
    spender: EthereumAddress,
    amount: Amount
  ): Promise<ContractTransaction | null> {
    const contract = this.token.getContract(this.config.signer);
    if (!contract) {
      return null;
    }

    return await contract
      .getFunction("approve")
      .populateTransaction(spender, amount.toBase());
  }

  protected async execute(
    tx: ContractTransaction
  ): Promise<ContractTransactionResponse> {
    try {
      return (await this.config.signer.sendTransaction(
        tx
      )) as ContractTransactionResponse;
    } catch (e) {
      if (isError(e, "ACTION_REJECTED")) {
        throw new StarkzapTransactionError(TransactionErrorCause.USER_REJECTED);
      }

      if (isError(e, "INSUFFICIENT_FUNDS")) {
        throw new StarkzapTransactionError(
          TransactionErrorCause.INSUFFICIENT_BALANCE
        );
      }

      // TODO be more specific with other ethers errors
      throw e;
    }
  }

  protected async getAllowanceSpender(): Promise<EthereumAddress | null> {
    return ethereumAddress(this.bridge);
  }

  protected async prepareDepositTransactionDetails(
    recipient: Address,
    amount: Amount
  ): Promise<EthereumTransactionDetails> {
    const signer = await this.config.signer.getAddress();
    const depositValue = await this.getEthDepositValue(recipient, amount);
    return {
      method: "deposit(address,uint256,uint256)",
      args: [
        this.bridgeToken.address.toString(),
        amount.toBase().toString(),
        recipient,
      ],
      transaction: {
        from: signer,
        value: depositValue,
      },
    };
  }

  ///// ABSTRACT

  ///// PRIVATE
  private setCachedAllowance(newValue: Amount | null) {
    this.allowanceCache = {
      current: newValue,
      timestamp: Date.now(),
    };
  }

  private clearCachedAllowance() {
    this.allowanceCache.timestamp = -1;
  }

  private async updateAllowanceFromReceipt(
    receipt: ContractTransactionReceipt
  ) {
    // TODO remove this log later
    console.log("UPDATE ALLOWANCE RECEIPT", receipt.logs, receipt.toJSON());
    const tokenInterface = this.token.getContract()?.interface;
    if (!tokenInterface || !receipt.logs) return;

    const approvalLog = receipt.logs.find((log) => {
      const parsedLog = tokenInterface.parseLog(log);
      if (parsedLog?.name === "Approval" && parsedLog.args) {
        const approvedAmount = parsedLog.args.value;
        return typeof approvedAmount === "bigint";
      }

      // TODO check that
      return;
    });

    if (approvalLog) {
      const newAllowance: bigint =
        tokenInterface.parseLog(approvalLog)!.args.value;
      const amount = await this.token.amount(newAllowance);
      this.setCachedAllowance(amount);
    } else {
      this.clearCachedAllowance();
    }
  }

  private async getEthDepositValue(
    recipient: Address,
    amount: Amount
  ): Promise<bigint> {
    const { fee } = await this.estimateL1ToL2MessageFeeValue(recipient, amount);

    const bridgedEthAmount = this.token.isNativeEth() ? amount.toBase() : 0n;
    return fee + bridgedEthAmount;
  }

  private async estimateL1ToL2MessageFeeValue(
    recipient: Address,
    amount: Amount
  ): Promise<{ fee: bigint; unit: PRICE_UNIT }> {
    try {
      const { low, high } = uint256.bnToUint256(amount.toBase());
      const l1Message: RPC.RPCSPEC010.L1Message = {
        from_address: await ethereumAddress(this.bridge),
        to_address: this.bridgeToken.starknetBridge.toString(),
        entry_point_selector: "handle_token_deposit",
        payload: [
          this.bridgeToken.address.toString(),
          await this.config.signer.getAddress(),
          recipient.toString(),
          low.toString(),
          high.toString(),
        ],
      };

      const { overall_fee, unit } = await this.starknetWallet
        .getProvider()
        .estimateMessageFee(l1Message);

      return { fee: BigInt(overall_fee), unit };
    } catch (error) {
      console.error("Estimate L1->L2 fee error", error);
      return { fee: 0n, unit: "WEI" };
    }
  }

  private async getSafeGasLimitValue(
    transactionDetails: EthereumTransactionDetails
  ): Promise<bigint> {
    const preparedTransaction =
      await this.prepareTransaction(transactionDetails);
    const estimatedGas =
      await this.config.provider.estimateGas(preparedTransaction);

    return (
      (estimatedGas *
        toBigInt(Math.ceil(EthereumBridge.GAS_LIMIT_SAFE_MULTIPLIER * 100))) /
      100n
    );
  }

  private async prepareTransaction(
    transactionDetails: EthereumTransactionDetails,
    gasLimit?: bigint | undefined
  ): Promise<ContractTransaction> {
    return await this.bridge
      .getFunction(transactionDetails.method)
      .populateTransaction(...transactionDetails.args, {
        ...transactionDetails.transaction,
        ...(gasLimit ? { gasLimit } : {}),
      });
  }
}
