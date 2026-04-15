export enum BridgeTransferStatus {
  /** L1 transaction submitted but not yet mined. */
  SUBMITTED_ON_L1 = "SUBMITTED_ON_L1",
  /** L1 transaction mined and confirmed. */
  CONFIRMED_ON_L1 = "CONFIRMED_ON_L1",
  /** L1 completion fully finalised (withdrawal completed on L1). */
  COMPLETED_ON_L1 = "COMPLETED_ON_L1",
  /** L1 transaction not found. */
  NOT_SUBMITTED_ON_L1 = "NOT_SUBMITTED_ON_L1",
  /** Starknet transaction submitted but not yet accepted on L2. */
  SUBMITTED_ON_STARKNET = "SUBMITTED_ON_STARKNET",
  /** Starknet transaction accepted on L2. */
  CONFIRMED_ON_STARKNET = "CONFIRMED_ON_STARKNET",
  /** Starknet transaction accepted on L1 (highest finality). */
  COMPLETED_ON_STARKNET = "COMPLETED_ON_STARKNET",
  /** Starknet transaction not found. */
  NOT_SUBMITTED_ON_STARKNET = "NOT_SUBMITTED_ON_STARKNET",
  /** Transaction reverted or encountered an unrecoverable error. */
  ERROR = "ERROR",
}

export interface DepositMonitorResult {
  status: BridgeTransferStatus;
  /** Resolved Starknet transaction hash, if available. */
  starknetTxHash?: string;
  /** External chain transaction hash. */
  externalTxHash?: string;
}

interface BaseWithdrawMonitorResult {
  status: BridgeTransferStatus;
  /** Starknet initiate-withdraw transaction hash. */
  starknetTxHash?: string;
  /** External chain completion transaction hash, if available. */
  externalTxHash?: string;
}

export interface CanonicalWithdrawMonitorResult extends BaseWithdrawMonitorResult {
  protocol: "canonical";
}

/**
 * CCTP withdraw monitor payload.
 *
 * `attestation`, `message`, and related Circle fields are set only after Circle
 * returns a **complete** attestation for the Starknet burn. Until then,
 * `status` may already be {@link BridgeTransferStatus.CONFIRMED_ON_STARKNET}
 * or {@link BridgeTransferStatus.COMPLETED_ON_STARKNET} while attestation data
 * is still absent — for example when Circle has not attested yet. Callers must confirm
 * `attestation` and `message` are defined before passing this result to
 * `completeWithdraw`.
 */
export interface CctpWithdrawMonitorResult extends BaseWithdrawMonitorResult {
  protocol: "cctp";
  attestation?: string;
  message?: string;
  nonce?: string;
  expirationBlock?: number;
}

export interface OftWithdrawMonitorResult extends BaseWithdrawMonitorResult {
  protocol: "oft" | "oft-migrated";
}

export interface HyperlaneWithdrawMonitorResult extends BaseWithdrawMonitorResult {
  protocol: "hyperlane";
}

export type WithdrawMonitorResult =
  | CanonicalWithdrawMonitorResult
  | CctpWithdrawMonitorResult
  | OftWithdrawMonitorResult
  | HyperlaneWithdrawMonitorResult;

export enum WithdrawalState {
  /** Bridging is in progress — no user action required yet. */
  PENDING = "PENDING",
  /** The withdrawal is ready to be finalised by the user on the external chain. */
  READY_TO_CLAIM = "READY_TO_CLAIM",
  /** The full bridge flow has completed on both sides. */
  COMPLETED = "COMPLETED",
  /** The withdrawal encountered an unrecoverable error. */
  ERROR = "ERROR",
}

export enum DepositState {
  /** Bridging is in progress — no user action required yet. */
  PENDING = "PENDING",
  /** The full bridge flow has completed on both sides. */
  COMPLETED = "COMPLETED",
  /** The deposit encountered an unrecoverable error. */
  ERROR = "ERROR",
}

/** Input accepted by `getWithdrawalState`. */
export type WithdrawalStateInput =
  | WithdrawMonitorResult
  | { starknetTxHash: string; externalTxHash?: string };

/** Input accepted by `getDepositState`. */
export type DepositStateInput =
  | DepositMonitorResult
  | { externalTxHash: string; starknetTxHash?: string };
