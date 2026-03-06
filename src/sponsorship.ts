/**
 * Sponsorship (paymaster) error handling.
 *
 * Import from here for a focused surface when you only need sponsorship types and helpers:
 *
 * @example
 * ```ts
 * import {
 *   SponsorshipNotAvailableError,
 *   getSponsorshipFriendlyMessage,
 *   SPONSORSHIP_REASONS,
 *   SPONSORSHIP_REASON_MESSAGES,
 * } from "starkzap/sponsorship";
 * ```
 *
 * All of these are also available from the main entry: `import { ... } from "starkzap"`.
 */
export {
  SponsorshipNotAvailableError,
  getSponsorshipFriendlyMessage,
  SPONSORSHIP_REASONS,
  SPONSORSHIP_REASON_MESSAGES,
} from "@/types/sponsorship-error";
export type {
  SponsorshipReason,
  SponsorshipProvider,
} from "@/types/sponsorship-error";
