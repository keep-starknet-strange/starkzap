/**
 * Sponsorship error types and helpers.
 *
 * **Import:** from main entry or focused subpath:
 * - `import { SponsorshipNotAvailableError, getSponsorshipFriendlyMessage } from "starkzap"`
 * - `import { SponsorshipNotAvailableError, getSponsorshipFriendlyMessage } from "starkzap/sponsorship"`
 */

/**
 * Normalized reason for sponsorship being unavailable.
 * Used by {@link SponsorshipNotAvailableError} so apps can show consistent UX
 * regardless of whether the failure came from AVNU or Cartridge.
 *
 * @public
 */
export type SponsorshipReason =
  | "policy_rejected"
  | "policy_exceeded"
  | "unsupported_asset"
  | "invalid_paymaster_config"
  | "network_unavailable"
  | "account_not_ready"
  | "unknown";

/** All possible sponsorship reasons; use for exhaustiveness checks and autocomplete. @public */
export const SPONSORSHIP_REASONS: readonly SponsorshipReason[] = [
  "policy_rejected",
  "policy_exceeded",
  "unsupported_asset",
  "invalid_paymaster_config",
  "network_unavailable",
  "account_not_ready",
  "unknown",
] as const;

/**
 * Sponsorship provider that reported the failure.
 *
 * @public
 */
export type SponsorshipProvider = "avnu" | "cartridge" | "unknown";

/** Human-readable default messages per reason; override in your app for i18n or custom copy. @public */
export const SPONSORSHIP_REASON_MESSAGES: Record<SponsorshipReason, string> = {
  policy_rejected: "Sponsorship not allowed for this transaction.",
  policy_exceeded: "Sponsorship quota exceeded. Fund the paymaster or pay gas.",
  unsupported_asset: "This asset is not supported for sponsorship.",
  invalid_paymaster_config: "Sponsorship is misconfigured. Check the documentations.",
  network_unavailable: "Sponsorship service unavailable. Fund the paymaster or pay gas.",
  account_not_ready: "Account not ready for sponsorship. Deploy or reconnect.",
  unknown: "Sponsorship unavailable. Try again or pay gas.",
};

/**
 * Returns a user-friendly message for a sponsorship reason.
 * Use for toasts, alerts, or fallback copy; override with your own for i18n.
 *
 * @example
 * ```ts
 * catch (e) {
 *   if (SponsorshipNotAvailableError.isSponsorshipError(e)) {
 *     toast.error(e.toFriendlyMessage());
 *   }
 * }
 * ```
 * @public
 */
export function getSponsorshipFriendlyMessage(
  reason: SponsorshipReason
): string {
  return SPONSORSHIP_REASON_MESSAGES[reason] ?? SPONSORSHIP_REASON_MESSAGES.unknown;
}

/**
 * First-class SDK error when a sponsored (gasless) execution is unavailable.
 *
 * Use this to:
 * - Catch sponsorship failures explicitly (`SponsorshipNotAvailableError.isSponsorshipError(e)` or `instanceof`)
 * - Show UX from `reason` or `toFriendlyMessage()` (or customize with {@link SPONSORSHIP_REASON_MESSAGES})
 * - Optionally enable fallback via `ExecuteOptions.fallbackTo: "user_pays"` and `onFallback`
 *
 * AVNU and Cartridge emit different raw errors; the SDK normalizes them into this single contract.
 *
 * @public
 *
 * @example
 * ```ts
 * try {
 *   await wallet.execute(calls, { feeMode: "sponsored" });
 * } catch (e) {
 *   if (SponsorshipNotAvailableError.isSponsorshipError(e)) {
 *     toast.error(e.toFriendlyMessage());
 *     if (e.reason === "policy_exceeded") trackQuotaHit();
 *   }
 *   throw e;
 * }
 * ```
 *
 * @example
 * ```ts
 * await wallet.execute(calls, {
 *   feeMode: "sponsored",
 *   fallbackTo: "user_pays",
 *   onFallback: (err) => toast.warn(err.toFriendlyMessage()),
 * });
 * ```
 */
export class SponsorshipNotAvailableError extends Error {
  readonly name = "SponsorshipNotAvailableError" as const;

  /** Normalized reason; use for UX or switch on with {@link SPONSORSHIP_REASONS}. */
  readonly reason: SponsorshipReason;

  /** Provider that reported the failure (avnu, cartridge, or unknown). */
  readonly provider: SponsorshipProvider;

  /** Always true: user must pay fees if they retry without sponsorship. */
  readonly fallbackFeeRequired = true as const;

  /** Original error from the provider; for logging or debugging. */
  readonly rawError: unknown;

  constructor(params: {
    reason: SponsorshipReason;
    provider: SponsorshipProvider;
    rawError: unknown;
    message?: string;
  }) {
    const message =
      params.message ??
      `Sponsorship not available (${params.reason}, provider: ${params.provider})`;
    super(message);
    this.reason = params.reason;
    this.provider = params.provider;
    this.rawError = params.rawError;
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, SponsorshipNotAvailableError.prototype);
    }
  }

  /**
   * Type guard: use in catch blocks so TypeScript narrows to this error.
   * @example
   * ```ts
   * catch (e) {
   *   if (SponsorshipNotAvailableError.isSponsorshipError(e)) {
   *     console.log(e.reason); // e is SponsorshipNotAvailableError
   *   }
   * }
   * ```
   */
  static isSponsorshipError(
    value: unknown
  ): value is SponsorshipNotAvailableError {
    return value instanceof SponsorshipNotAvailableError;
  }

  /**
   * User-friendly message for this error's reason.
   * Uses {@link SPONSORSHIP_REASON_MESSAGES}; override in your app for i18n.
   */
  toFriendlyMessage(): string {
    return getSponsorshipFriendlyMessage(this.reason);
  }
}
