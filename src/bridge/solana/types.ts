import type { FeeErrorCause } from "@/types/errors";
import type { SolanaAddress } from "@/types";
import type { Amount } from "@/types";

export type SolanaTransaction = unknown;
export type SolanaConnection = unknown;

/**
 * Provider interface for Solana transactions.
 *
 * Compatible with the Reown AppKit Solana provider's
 * `signAndSendTransaction` method.
 */
export interface SolanaProvider {
  signAndSendTransaction(transaction: SolanaTransaction): Promise<string>;
}

export type SolanaWalletConfig = {
  address: SolanaAddress;
  provider: SolanaProvider;
  connection: SolanaConnection;
};

export type HyperlaneFeeEstimate = {
  localFee: Amount;
  interchainFee: Amount;
  localFeeError?: FeeErrorCause;
  interchainFeeError?: FeeErrorCause;
};

export type SolanaDepositFeeEstimation = HyperlaneFeeEstimate;

export type SolanaWithdrawFeeEstimation = HyperlaneFeeEstimate;
