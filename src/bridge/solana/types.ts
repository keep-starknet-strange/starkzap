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

/**
 * Quote is requested at the LayerSwap route minimum (`amount: 0`), so
 * percentage-scaled components will differ for larger deposits — re-quote
 * at swap-creation time for exact numbers.
 */
export type SolanaLayerSwapDepositFeeEstimation = {
  /** User's Solana tx cost in SOL (wallet outflow). */
  localFee: Amount;
  /** Total fee at the route minimum tier (bridge token, deducted from input). */
  totalFee: Amount;
  /** Blockchain fee portion at the route minimum tier (bridge token, deducted from input). */
  blockchainFee: Amount;
  /** LayerSwap service fee portion at the route minimum tier (bridge token, deducted from input). */
  serviceFee: Amount;
  /** Estimated completion time (e.g. "00:02:00"). */
  avgCompletionTime: string;
  /** Set when the LayerSwap quote fetch fails; `totalFee` / `blockchainFee` / `serviceFee` / `avgCompletionTime` will be zero/empty. */
  quoteError?: FeeErrorCause;
};

export type SolanaWithdrawFeeEstimation = HyperlaneFeeEstimate;

/**
 * Quote is requested at the LayerSwap route minimum (`amount: 0`), so
 * percentage-scaled components will differ for larger withdrawals — re-quote
 * at swap-creation time for exact numbers.
 */
export type SolanaLayerSwapInitiateWithdrawFeeEstimation = {
  /** Starknet L2 fee to submit the transfer to LayerSwap's deposit address. */
  l2Fee: Amount;
  l2FeeError?: FeeErrorCause;
  /** Destination-chain settlement cost quoted by LayerSwap (bridge token, deducted from input). */
  blockchainFee: Amount;
  /** LayerSwap service fee portion at the route minimum tier (bridge token, deducted from input). */
  serviceFee: Amount;
  /** Estimated completion time (e.g. "00:02:00"). */
  avgCompletionTime: string;
  /** Set when the LayerSwap quote fetch fails; `blockchainFee` / `serviceFee` / `avgCompletionTime` will be zero/empty. */
  quoteError?: FeeErrorCause;
};
