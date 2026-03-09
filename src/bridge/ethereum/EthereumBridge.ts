import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  fromAddress,
  fromEthereumAddress,
} from "@/types";
import type { EthereumTokenInterface } from "@/bridge/ethereum/EthereumToken";
import {
  type ApprovalFeeEstimation,
  ethereumAddress,
  type EthereumTransactionDetails,
  type EthereumWalletConfig,
} from "@/bridge/ethereum/types";
import {
  Contract,
  type ContractTransaction,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  isError,
  toBigInt,
} from "ethers";
import {
  FeeErrorCause,
  StarkzapTransactionError,
  TransactionErrorCause,
} from "@/types/errors";
import { RPC, uint256 } from "starknet";
import type { WalletInterface } from "@/wallet";
import BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";
import type { FeeEstimation } from "@/bridge/types/generics";

export abstract class EthereumBridge implements BridgeInterface<EthereumBridgeToken> {
  public static readonly ALLOWANCE_CACHE_TTL = 60_000;
  public static readonly GAS_LIMIT_SAFE_MULTIPLIER = 1.5;
  private static readonly DUMMY_SN_ADDRESS = fromAddress(
    "0x023123100123103023123acb1231231231231031231ca123f23123123123100a"
  );
  private static readonly DUMMY_ETH_ADDRESS = fromEthereumAddress(
    "0x023123100123103023123acb1231231231231031"
  );
  private static readonly DEFAULT_ESTIMATED_DEPOSIT_GAS_REQUIREMENT = 154744n;

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
    await this.approveSpendingOf(amount);

    const details = await this.prepareDepositTransactionDetails(
      recipient,
      amount
    );
    const tx = await this.populateTransaction(details);
    const gasLimit = await this.estimateEthereumSafeGasLimitForTx(tx);
    const response = await this.execute({ ...tx, gasLimit });

    this.clearCachedAllowance();

    return response;
  }

  async getDepositFeeEstimate(): Promise<FeeEstimation<EthereumBridgeToken>> {
    const minimalAmount = await this.token.amount(1n);

    const [allowance, l1ToL2MessageFee, approvalFeeEstimation] =
      await Promise.all([
        this.getAllowance(),
        this.estimateL1ToL2MessageFee(
          EthereumBridge.DUMMY_SN_ADDRESS,
          minimalAmount
        ),
        this.estimateApprovalFee(),
      ]);

    const { fee: l2Fee, l2FeeError } = l1ToL2MessageFee;
    const { approvalFee, approvalFeeError } = approvalFeeEstimation;

    let l1Fee;
    let l1FeeError: FeeErrorCause | undefined;

    const needsFallback = allowance !== null && allowance.isZero();
    if (needsFallback) {
      const feeDecimal =
        EthereumBridge.DEFAULT_ESTIMATED_DEPOSIT_GAS_REQUIREMENT *
        (await this.getEthereumGasPrice());
      l1Fee = this.ethAmount(feeDecimal);
    } else {
      const details = await this.prepareDepositTransactionDetails(
        EthereumBridge.DUMMY_SN_ADDRESS,
        minimalAmount
      );
      const tx = await this.populateTransaction(details);
      const estimate = await this.estimateEthereumGasFeeForTx(tx);
      l1Fee = estimate.gasFee;
      l1FeeError = estimate.error;
    }

    return {
      l1Fee,
      l1FeeError,
      l2Fee,
      l2FeeError,
      approvalFee,
      approvalFeeError,
    };
  }

  async getAvailableDepositBalance(account: EthereumAddress): Promise<Amount> {
    return this.token.balanceOf(account);
  }

  async getAllowance(): Promise<Amount | null> {
    const allowanceSpender = await this.getAllowanceSpender();
    if (!allowanceSpender) {
      console.error("No allowance spender found");
      return null;
    }

    if (
      Date.now() - this.allowanceCache.timestamp >
      EthereumBridge.ALLOWANCE_CACHE_TTL
    ) {
      const signerAddress = await this.config.signer.getAddress();
      console.log("Getting allowance from token");
      const allowance = await this.token.allowance(
        fromEthereumAddress(signerAddress),
        allowanceSpender
      );
      console.log("Updating allowance cache");
      this.setCachedAllowance(allowance);
    }

    console.log("Returning allowance", this.allowanceCache.current);
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
      return;
    }

    if (!allowance.lt(amount)) {
      return;
    }

    const tx = await this.getApprovalTransaction(spender, amount);
    if (!tx) {
      return;
    }

    const response = await this.execute(tx);
    const receipt = await response.wait();
    if (!receipt?.status) {
      throw new StarkzapTransactionError(TransactionErrorCause.APPROVE_FAILED);
    }

    await this.updateAllowanceFromReceipt(receipt);
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
        value: depositValue.toBase(),
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
      return (
        parsedLog?.name === "Approval" &&
        typeof parsedLog.args?.value === "bigint"
      );
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
  ): Promise<Amount> {
    const { fee } = await this.estimateL1ToL2MessageFee(recipient, amount);

    const bridgedEthAmount = this.token.isNativeEth()
      ? amount
      : this.ethAmount(0n);
    return fee.add(bridgedEthAmount);
  }

  private async estimateL1ToL2MessageFee(
    recipient: Address,
    amount: Amount
  ): Promise<{ fee: Amount; l2FeeError?: FeeErrorCause }> {
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

      const fee = Amount.fromRaw(
        overall_fee,
        18,
        unit === "WEI" ? "ETH" : "STRK"
      );

      return { fee };
    } catch {
      return {
        fee: Amount.fromRaw(0n, 18, "ETH"),
        l2FeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
  }

  private async estimateApprovalFee(): Promise<ApprovalFeeEstimation> {
    if (this.token.isNativeEth()) {
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
      const approvalTransaction = await this.getApprovalTransaction(
        EthereumBridge.DUMMY_ETH_ADDRESS,
        await this.token.amount(1n)
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
    } catch (error) {
      console.error("Failed to calc approval fee", error);
      return {
        approvalFee: this.ethAmount(0n),
        approvalFeeError: FeeErrorCause.APPROVAL_FEE_ERROR,
      };
    }
  }

  private async populateTransaction(
    details: EthereumTransactionDetails
  ): Promise<ContractTransaction> {
    return await this.bridge
      .getFunction(details.method)
      .populateTransaction(...details.args, details.transaction);
  }

  private async estimateEthereumSafeGasLimitForTx(
    tx: ContractTransaction
  ): Promise<bigint> {
    const estimated = await this.config.provider.estimateGas(tx);
    return (
      (estimated *
        toBigInt(Math.ceil(EthereumBridge.GAS_LIMIT_SAFE_MULTIPLIER * 100))) /
      100n
    );
  }

  private async estimateEthereumGasFeeForTx(
    tx: ContractTransaction
  ): Promise<{ gasFee: Amount; error?: FeeErrorCause }> {
    try {
      const [gasUnits, gasPrice] = await Promise.all([
        this.config.provider.estimateGas(tx),
        this.getEthereumGasPrice(),
      ]);
      return { gasFee: this.ethAmount(gasUnits * gasPrice) };
    } catch {
      return {
        gasFee: this.ethAmount(0n),
        error: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  private async getEthereumGasPrice(): Promise<bigint> {
    const gasData = await this.config.provider.getFeeData();
    const gasPrice = gasData.gasPrice ?? 0n;
    const maxFeePerGas = gasData.maxFeePerGas;

    return maxFeePerGas && gasData.maxPriorityFeePerGas
      ? maxFeePerGas
      : gasPrice;
  }

  private ethAmount(value: bigint): Amount {
    return Amount.fromRaw(value, 18, "ETH");
  }
}
