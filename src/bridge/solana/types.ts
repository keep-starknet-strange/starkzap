import type { FeeErrorCause } from "@/types/errors";
import type { SolanaProvider } from "@/connect";
import type { Connection } from "@solana/web3.js";

export type SolanaWalletConfig = {
  signer: SolanaProvider;
  connection: Connection;
};

export type HyperlaneFeeEstimate = {
  localFee: bigint;
  interchainFee: bigint;
  localFeeError?: FeeErrorCause;
  interchainFeeError?: FeeErrorCause;
};

export type SolanaDepositFeeEstimation = HyperlaneFeeEstimate & {
  feeUnit: "sol";
};
