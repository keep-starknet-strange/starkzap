import type { FeeErrorCause } from "@/types/errors";
import type { SolanaAddress } from "@/types";
import type {
  Connection,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Amount } from "starkzap";

/**
 * Signer interface for Solana transactions.
 *
 * Compatible with the Reown AppKit Solana provider's
 * `signAndSendTransaction` method.
 */
export interface SolanaSigner {
  signAndSendTransaction(
    transaction: Transaction | VersionedTransaction
  ): Promise<string>;
}

export type SolanaWalletConfig = {
  address: SolanaAddress;
  signer: SolanaSigner;
  connection: Connection;
};

export type HyperlaneFeeEstimate = {
  localFee: Amount;
  interchainFee: Amount;
  localFeeError?: FeeErrorCause;
  interchainFeeError?: FeeErrorCause;
};

export type SolanaDepositFeeEstimation = HyperlaneFeeEstimate;
