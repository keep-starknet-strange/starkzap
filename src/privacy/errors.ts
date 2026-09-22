/**
 * Screening verdicts from the proving service.
 *
 * Deposits are screened against sanctions lists before a proof is produced.
 * The client sees the result as a JSON-RPC error on `execute()`.
 *
 * - `rejected`: the depositor address is blocked. Retrying will not help.
 * - `unavailable`: screening could not complete. Retry later.
 */
export type ScreeningVerdict = "rejected" | "unavailable";

/** JSON-RPC code the proof interceptor returns for a rejected transaction. */
const TRANSACTION_REJECTED = 10000;

/** The only `data` values that mean a screening verdict. */
const BLOCKED_REASON = "address_blocked";
const UNAVAILABLE_REASON = "screening_unavailable";

/**
 * Classify an error from a privacy pool `execute()` as a screening verdict, or
 * `undefined` when it is not one.
 *
 * Safe to call from any catch block. It does not need the optional peer
 * dependency.
 *
 * Code `10000` alone is not enough, because the interceptor uses it for other
 * failures too. Only the exact reason strings count.
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
