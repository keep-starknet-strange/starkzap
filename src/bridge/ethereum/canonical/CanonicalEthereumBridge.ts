import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import type {
  BridgeDepositOptions,
  EthereumDepositFeeEstimation,
  EthereumTransactionDetails,
} from "@/bridge";
import { DUMMY_SN_ADDRESS } from "@/bridge/ethereum/types";
import {
  type EthereumAddress,
  type ExternalTransactionResponse,
} from "@/types";
import { ethereumAddress } from "@/bridge/ethereum/EtherToken";
import { type ContractTransaction, toBigInt } from "ethers";
import { type Address, Amount } from "@/types";
import { RPC, uint256 } from "starknet";
import { FeeErrorCause } from "@/types/errors";

export class CanonicalEthereumBridge extends EthereumBridge {
  private static readonly DEFAULT_ESTIMATED_DEPOSIT_GAS_REQUIREMENT = 154744n;

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
    } catch {
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
    } catch {
      return {
        gasFee: this.ethAmount(0n),
        error: FeeErrorCause.GENERIC_L1_FEE_ERROR,
      };
    }
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
}
