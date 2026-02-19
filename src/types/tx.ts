import type { TransactionExecutionStatus, TXN_STATUS } from "starknet";

// Re-export transaction types from starknet.js
export type {
  GetTransactionReceiptResponse as TxReceipt,
  TransactionExecutionStatus,
  TransactionFinalityStatus,
  waitForTransactionOptions as WaitOptions,
} from "starknet";

export { ETransactionStatus as TransactionStatus } from "starknet";

// ─── Watch ───────────────────────────────────────────────────────────────────

/**
 * Status update emitted by `tx.watch()`.
 * Uses starknet.js status values.
 */
export interface TxStatusUpdate {
  /** Current finality status */
  finality: TXN_STATUS;
  /** Execution status (SUCCEEDED or REVERTED), if available */
  execution: TransactionExecutionStatus | undefined;
}

/** Callback invoked when transaction status changes */
export type TxWatchCallback = (update: TxStatusUpdate) => void;

/** Options for `tx.watch()` polling behavior. */
export interface TxWatchOptions {
  /** Poll interval in milliseconds (default: 5000). */
  pollIntervalMs?: number;
  /**
   * Maximum watch duration in milliseconds before auto-stop.
   * Set to `0` to disable timeout.
   * @default 600000 (10 minutes)
   */
  timeoutMs?: number;
  /** Optional callback for recoverable polling errors or timeout. */
  onError?: (error: Error) => void;
}

/** Function to stop watching (returned by `tx.watch()`) */
export type TxUnsubscribe = () => void;
