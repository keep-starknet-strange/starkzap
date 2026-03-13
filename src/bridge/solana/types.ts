import type { FeeErrorCause } from "@/types/errors";
import type { SolanaAddress } from "@/types";
import type {
  Connection,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Amount } from "@/types";

/**
 * Provider interface for Solana transactions.
 *
 * Compatible with the Reown AppKit Solana provider's
 * `signAndSendTransaction` method.
 */
export interface SolanaProvider {
  signAndSendTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<string>;
}

export type SolanaWalletConfig = {
  address: SolanaAddress;
  provider: SolanaProvider;
  connection: Connection;
};

export type HyperlaneFeeEstimate = {
  localFee: Amount;
  interchainFee: Amount;
  localFeeError?: FeeErrorCause;
  interchainFeeError?: FeeErrorCause;
};

export type SolanaDepositFeeEstimation = HyperlaneFeeEstimate;
