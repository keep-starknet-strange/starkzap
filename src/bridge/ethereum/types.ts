import type { FeeErrorCause } from "@/types/errors";
import { type Amount, fromAddress } from "@/types";

/**
 * Dummy Starknet address used for fee estimation when no real recipient is known.
 * Shared across Canonical and OFT bridge implementations.
 */
export const DUMMY_SN_ADDRESS = fromAddress(
  "0x023123100123103023123acb1231231231231031231ca123f23123123123100a"
);
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
