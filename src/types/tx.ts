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

/** Function to stop watching (returned by `tx.watch()`) */
export type TxUnsubscribe = () => void;
