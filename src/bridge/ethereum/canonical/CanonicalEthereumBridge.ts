import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import type {
  BridgeDepositOptions,
  EthereumDepositFeeEstimation,
  EthereumInitiateWithdrawFeeEstimation,
  EthereumTransactionDetails,
  EthereumWalletConfig,
  InitiateBridgeWithdrawOptions,
} from "@/bridge";
import { DUMMY_L1_ADDRESS, DUMMY_SN_ADDRESS } from "@/bridge/ethereum/types";
import {
  type Address,
  Amount,
  type EthereumAddress,
  EthereumBridgeToken,
  type ExternalAddress,
  type ExternalTransactionResponse,
} from "@/types";
import { ethereumAddress } from "@/bridge/ethereum/EtherToken";
import { type ContractTransaction, type InterfaceAbi } from "ethers";
import { type Call, CallData, RPC, uint256 } from "starknet";
import { FeeErrorCause } from "@/types/errors";
import type { WalletInterface } from "@/wallet";
import {
  type AutoWithdrawFeeOutput,
  AutoWithdrawFeesHandler,
} from "@/bridge/utils/auto-withdraw-fees-handler";
import CANONICAL_BRIDGE_ABI from "@/abi/ethereum/canonicalBridge.json";
import type { Tx } from "@/tx";
import type { StarkZapLogger } from "@/logger";

export class CanonicalEthereumBridge extends EthereumBridge {
  private static readonly DEFAULT_ESTIMATED_DEPOSIT_GAS_REQUIREMENT = 154744n;

  constructor(
    bridgeToken: EthereumBridgeToken,
    config: EthereumWalletConfig,
    starknetWallet: WalletInterface,
    private readonly autoWithdrawFeesHandler: AutoWithdrawFeesHandler,
    logger: StarkZapLogger,
    bridgeAbi: InterfaceAbi = CANONICAL_BRIDGE_ABI
  ) {
    super(bridgeToken, config, starknetWallet, logger, bridgeAbi);
  }

  async deposit(
    recipient: Address,
    amount: Amount,
    _options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse> {
    await this.approveSpendingOf(amount);

    const details = await this.prepareDepositTransactionDetails(
      recipient,
      amount
    );
    const tx = await this.populateTransaction(details);
    const gasLimit = await this.estimateEthereumSafeGasLimitForTx(tx);
    const response = await this.execute({ ...tx, gasLimit });

    this.clearCachedAllowance();

    return { hash: response.hash };
  }

  protected getAllowanceSpender(): Promise<EthereumAddress | null> {
    return ethereumAddress(this.bridge);
  }

  async getDepositFeeEstimate(
    _options?: BridgeDepositOptions
  ): Promise<EthereumDepositFeeEstimation> {
    const minimalAmount = await this.token.amount(1n);

    const [allowance, l1ToL2MessageFee, approvalFeeEstimation] =
      await Promise.all([
        this.getAllowance(),
        this.estimateL1ToL2MessageFee(DUMMY_SN_ADDRESS, minimalAmount),
        this.estimateApprovalFee(),
      ]);

    const { fee: l2Fee, l2FeeError } = l1ToL2MessageFee;
    const { approvalFee, approvalFeeError } = approvalFeeEstimation;

    let l1Fee;
    let l1FeeError: FeeErrorCause | undefined;

    const needsFallback = allowance !== null && allowance.isZero();
    if (needsFallback) {
      const feeDecimal =
        CanonicalEthereumBridge.DEFAULT_ESTIMATED_DEPOSIT_GAS_REQUIREMENT *
        (await this.getEthereumGasPrice());
      l1Fee = this.ethAmount(feeDecimal);
    } else {
      const details = await this.prepareDepositTransactionDetails(
        DUMMY_SN_ADDRESS,
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

  async initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx> {
    if (options?.protocol === "canonical" && options.autoWithdraw) {
      if (!this.bridgeToken.supportsAutoWithdraw) {
        throw new Error(
          `"autoWithdraw" was provided but token ${this.bridgeToken.name} does not support auto-withdrawals.`
        );
      }

      const feeData = await this.autoWithdrawFeesHandler.getFeeData({
        bridgeToken: this.bridgeToken,
        amount,
        walletOrAddress: this.starknetWallet,
        preferredFeeToken: options.preferredFeeToken,
      });

      const autoWithdraw = await this.getAutoWithdrawTransferCall(feeData);
      const initiateWithdraw = this.buildInitiateWithdrawCall(
        recipient.toString(),
        amount
      );

      return this.starknetWallet.execute(
        [autoWithdraw, initiateWithdraw],
        options
      );
    }

    return super.initiateWithdraw(recipient, amount, options);
  }

  async getInitiateWithdrawFeeEstimate(
    options?: InitiateBridgeWithdrawOptions
  ): Promise<EthereumInitiateWithdrawFeeEstimation> {
    const calls: Call[] = [];
    const minAmount = await this.token.amount(1n);

    let autoWithdrawFee: Amount | undefined = undefined;
    let autoWithdrawFeeError: FeeErrorCause | undefined;
    if (options?.protocol === "canonical" && options.autoWithdraw) {
      if (!this.bridgeToken.supportsAutoWithdraw) {
        throw new Error(
          `"autoWithdraw" was provided but token ${this.bridgeToken.name} does not support auto-withdrawals.`
        );
      }

      try {
        const feeData = await this.autoWithdrawFeesHandler.getFeeData({
          bridgeToken: this.bridgeToken,
          amount: minAmount,
          walletOrAddress: this.starknetWallet,
          preferredFeeToken: options.preferredFeeToken,
        });

        autoWithdrawFee = feeData.preselectedGasToken.cost;
        autoWithdrawFeeError = undefined;

        calls.push(await this.getAutoWithdrawTransferCall(feeData));
      } catch (e) {
        this.logger.debug(
          "[CanonicalEthereumBridge] getAutoWithdrawTransferCall failed:",
          e
        );
        autoWithdrawFee = undefined;
        autoWithdrawFeeError = FeeErrorCause.AW_FEE_ERROR;
      }
    }

    calls.push(this.buildInitiateWithdrawCall(DUMMY_L1_ADDRESS, minAmount));

    try {
      const estimate = await this.starknetWallet.estimateFee(calls);
      const isFri = estimate.unit === "FRI";
      return {
        l2Fee: Amount.fromRaw(estimate.overall_fee, 18, isFri ? "STRK" : "ETH"),
        autoWithdrawFee,
        autoWithdrawFeeError,
      };
    } catch (e) {
      this.logger.debug(
        "[CanonicalEthereumBridge] getInitiateWithdrawFeeEstimate (L2 fee) failed:",
        e
      );
      return {
        l2Fee: Amount.fromRaw(0n, 18, "STRK"),
        l2FeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
        autoWithdrawFee,
        autoWithdrawFeeError,
      };
    }
  }

  protected async getEthereumGasPrice(): Promise<bigint> {
    const gasData = await this.config.provider.getFeeData();
    const gasPrice = gasData.gasPrice ?? 0n;
    const maxFeePerGas = gasData.maxFeePerGas;

    return maxFeePerGas && gasData.maxPriorityFeePerGas
      ? maxFeePerGas
      : gasPrice;
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
        recipient.toString(),
      ],
      transaction: {
        from: signer,
        value: depositValue.toBase(),
      },
    };
  }

  protected async estimateL1ToL2MessageFee(
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
    } catch (e) {
      this.logger.debug(
        "[CanonicalEthereumBridge] estimateL1ToL2MessageFee failed:",
        e
      );
      return {
        fee: Amount.fromRaw(0n, 18, "ETH"),
        l2FeeError: FeeErrorCause.GENERIC_L2_FEE_ERROR,
      };
    }
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
    } catch (e) {
      this.logger.debug(
        "[CanonicalEthereumBridge] estimateEthereumGasFeeForTx failed:",
        e
      );
      return {
        gasFee: this.ethAmount(0n),
        error: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
  }

  protected async getEthDepositValue(
    recipient: Address,
    amount: Amount
  ): Promise<Amount> {
    const { fee } = await this.estimateL1ToL2MessageFee(recipient, amount);

    const bridgedEthAmount = this.token.isNativeEth()
      ? amount
      : this.ethAmount(0n);
    return fee.add(bridgedEthAmount);
  }

  protected async getAutoWithdrawTransferCall(
    feeData: AutoWithdrawFeeOutput
  ): Promise<Call> {
    const feeTokenAddress = feeData.preselectedGasToken.tokenAddress;
    const gasCost = feeData.preselectedGasToken.cost;

    return {
      contractAddress: feeTokenAddress,
      entrypoint: "transfer",
      calldata: CallData.compile({
        user: feeData.relayerAddress,
        amount: uint256.bnToUint256(gasCost.toBase()),
      }),
    };
  }
}
