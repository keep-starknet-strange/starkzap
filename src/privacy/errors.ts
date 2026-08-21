/**
 * Screening verdicts surfaced by the proving service.
 *
 * Deposits into the privacy pool are screened against sanctions lists before a
 * proof is produced. The check runs server-side so the only thing a client ever
 * sees is a JSON-RPC error on `execute()`.
 *
 * - `rejected` — the depositor address is blocked. Terminal: retrying with the
 *   same address will not succeed.
 * - `unavailable` — screening could not complete. Transient: deposits fail
 *   closed (no attestation means no deposit), so the caller may retry later.
 */
export type ScreeningVerdict = "rejected" | "unavailable";

/** JSON-RPC code the proof interceptor returns for a rejected transaction. */
const TRANSACTION_REJECTED = 10000;

/**
 * Opaque reasons the interceptor emits on the screening checkpoint. These are
 * the only values that denote a screening verdict — a wire contract with the
 * proof interceptor.
 */
const BLOCKED_REASON = "address_blocked";
const UNAVAILABLE_REASON = "screening_unavailable";

/**
 * Classify an error thrown by a privacy pool `execute()` as a screening
 * verdict, or `undefined` when it is not one.
 *
 * The privacy SDK exports its own mapper but never applies it, so `execute()`
 * rejects with the raw proving-service error and classification is left to the
 * caller. This does that classification without needing the optional peer
 * dependency loaded, so it is safe to call from any catch block.
 *
 * Code `10000` alone is not enough: the interceptor also emits it for non-pool
 * transactions and for unexpected internal faults. Only the exact reason
 * strings above are treated as verdicts, so a transient interceptor failure is
 * never reported as a permanent sanctions rejection the user is told to give
 * up on.
 *
 * @param error - The value caught from a privacy pool operation
 * @returns The verdict, or `undefined` if the error is unrelated to screening
 *
 * @example
 * ```ts
 * try {
 *   await transfers.build().with(STRK, (t) => t.deposit({ amount })).execute();
 * } catch (error) {
 *   switch (screeningVerdict(error)) {
 *     case "rejected":    return showBlocked();   // terminal
 *     case "unavailable": return retryLater();    // transient
 *     default:            throw error;
 *   }
 * }
 * ```
 */
export function screeningVerdict(error: unknown): ScreeningVerdict | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const { code, data } = error as { code?: unknown; data?: unknown };
  if (code !== TRANSACTION_REJECTED) {
    return undefined;
  }

  if (data === BLOCKED_REASON) return "rejected";
  if (data === UNAVAILABLE_REASON) return "unavailable";

  return undefined;
}
