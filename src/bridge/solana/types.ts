import type { FeeErrorCause } from "@/types/errors";

export type HyperlaneFeeEstimate = {
  localFee: bigint;
  interchainFee: bigint;
  localFeeError?: FeeErrorCause;
  interchainFeeError?: FeeErrorCause;
};

export type SolanaDepositFeeEstimation = HyperlaneFeeEstimate & {
  feeUnit: "sol";
};
