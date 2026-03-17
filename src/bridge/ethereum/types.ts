import type { FeeErrorCause } from "@/types/errors";
import type { Amount } from "@/types";
import type { PreparedTransactionRequest, Provider, Signer } from "ethers";

export type EthereumWalletConfig = {
  signer: Signer;
  provider: Provider;
};

export type EthereumTransactionDetails = {
  method: string;
  args: string[];
  transaction: PreparedTransactionRequest;
};

export type ApprovalFeeEstimation = {
  approvalFee: Amount;
  approvalFeeError?: FeeErrorCause | undefined;
};

export type EthereumDepositFeeEstimation = ApprovalFeeEstimation & {
  l1Fee: Amount;
  l2Fee: Amount;
  l1FeeError?: FeeErrorCause | undefined;
  l2FeeError?: FeeErrorCause | undefined;
};

export type CCTPDepositFeeEstimation = EthereumDepositFeeEstimation & {
  fastTransferBpFee: number;
};

export type OftDepositFeeEstimation = EthereumDepositFeeEstimation & {
  /** LayerZero interchain fee (in ETH, included in msg.value of the deposit tx). */
  interchainFee: Amount;
};
