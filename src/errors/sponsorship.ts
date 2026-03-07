/**
 * Error thrown when gas sponsorship is not available.
 *
 * This error provides structured information about why sponsorship failed,
 * enabling applications to implement proper fallback handling.
 *
 * @example
 * ```ts
 * try {
 *   const tx = await wallet.transfer(token, transfers, { feeMode: "sponsored" });
 * } catch (err) {
 *   if (err instanceof SponsorshipNotAvailableError) {
 *     console.log(`Sponsorship failed: ${err.reason}`);
 *     if (err.fallbackFeeRequired) {
 *       // Retry with user pays
 *       const tx = await wallet.transfer(token, transfers, { feeMode: "user_pays" });
 *     }
 *   }
 * }
 * ```
 */
export class SponsorshipNotAvailableError extends Error {
  /**
   * The reason why sponsorship is not available.
   *
   * - `"not_whitelisted"`: The token or action is not whitelisted for sponsorship
   * - `"policy_exceeded"`: The sponsorship policy limit has been exceeded
   * - `"network_unavailable"`: Sponsorship is not available on this network
   * - `"insufficient_balance"`: Sponsor has insufficient balance
   * - `"unknown"`: The reason could not be determined
   */
  readonly reason:
    | "not_whitelisted"
    | "policy_exceeded"
    | "network_unavailable"
    | "insufficient_balance"
    | "unknown";

  /**
   * Whether the user can pay gas fees if sponsorship fails.
   *
   * When `true`, the transaction can be retried with `feeMode: "user_pays"`.
   * When `false`, the transaction cannot proceed (e.g., network error).
   */
  readonly fallbackFeeRequired: boolean;

  /**
   * The original error that caused the sponsorship failure, if available.
   */
  readonly originalError?: Error;

  constructor(
    reason: SponsorshipNotAvailableError["reason"],
    options?: {
      fallbackFeeRequired?: boolean;
      originalError?: Error | undefined;
      message?: string;
    }
  ) {
    const message =
      options?.message ??
      `Sponsorship not available: ${reason}${
        options?.fallbackFeeRequired !== false
          ? " (user can pay fees)"
          : " (transaction cannot proceed)"
      }`;

    super(message);
    this.name = "SponsorshipNotAvailableError";
    this.reason = reason;
    this.fallbackFeeRequired = options?.fallbackFeeRequired ?? true;
    if (options?.originalError !== undefined) {
      this.originalError = options.originalError;
    }
  }

  /**
   * Check if an error is a sponsorship failure.
   *
   * @example
   * ```ts
   * try {
   *   await wallet.execute(calls, { feeMode: "sponsored" });
   * } catch (err) {
   *   if (SponsorshipNotAvailableError.is(err)) {
   *     // Handle sponsorship failure
   *   }
   * }
   * ```
   */
  static is(error: unknown): error is SponsorshipNotAvailableError {
    return error instanceof SponsorshipNotAvailableError;
  }

  /**
   * Attempt to detect sponsorship failure from a generic error.
   *
   * This method parses error messages to detect common sponsorship failure
   * patterns and returns a structured error if detected.
   *
   * @example
   * ```ts
   * try {
   *   await wallet.execute(calls, { feeMode: "sponsored" });
   * } catch (err) {
   *   const structured = SponsorshipNotAvailableError.fromError(err);
   *   if (structured instanceof SponsorshipNotAvailableError) {
   *     console.log("Sponsorship failed:", structured.reason);
   *   }
   * }
   * ```
   */
  static fromError(error: unknown): SponsorshipNotAvailableError | Error {
    if (error instanceof SponsorshipNotAvailableError) {
      return error;
    }

    if (!(error instanceof Error)) {
      return new SponsorshipNotAvailableError("unknown", {
        message: String(error),
      });
    }

    const message = error.message.toLowerCase();

    // Check for common sponsorship failure patterns
    if (
      message.includes("not in policies") ||
      message.includes("not whitelisted") ||
      message.includes("token not supported") ||
      message.includes("unsupported token")
    ) {
      return new SponsorshipNotAvailableError("not_whitelisted", {
        originalError: error,
        fallbackFeeRequired: true,
      });
    }

    if (
      message.includes("policy exceeded") ||
      message.includes("limit exceeded") ||
      message.includes("quota exceeded") ||
      message.includes("rate limit")
    ) {
      return new SponsorshipNotAvailableError("policy_exceeded", {
        originalError: error,
        fallbackFeeRequired: true,
      });
    }

    if (
      message.includes("network") ||
      message.includes("chain") ||
      message.includes("not available on")
    ) {
      return new SponsorshipNotAvailableError("network_unavailable", {
        originalError: error,
        fallbackFeeRequired: false,
      });
    }

    if (
      message.includes("insufficient") &&
      (message.includes("balance") || message.includes("funds"))
    ) {
      return new SponsorshipNotAvailableError("insufficient_balance", {
        originalError: error,
        fallbackFeeRequired: true,
      });
    }

    // If the error mentions sponsorship but we couldn't categorize it
    if (
      message.includes("sponsored") ||
      message.includes("sponsor") ||
      message.includes("paymaster")
    ) {
      return new SponsorshipNotAvailableError("unknown", {
        originalError: error,
        fallbackFeeRequired: true,
      });
    }

    return error;
  }
}
