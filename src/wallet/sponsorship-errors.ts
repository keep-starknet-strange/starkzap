/**
 * Internal normalization of AVNU and Cartridge sponsorship failures.
 * Only failures that clearly mean "sponsorship unavailable" are normalized;
 * ordinary transaction reverts are not converted.
 */

import type { SponsorshipReason } from "@/types/sponsorship-error";

export type NormalizedSponsorshipFailure = {
  reason: SponsorshipReason;
  provider: "avnu" | "cartridge";
};

function messageAndCode(error: unknown): { message: string; code?: string } {
  const message =
    error instanceof Error ? error.message : String(error ?? "").slice(0, 2000);
  let code: string | undefined;
  if (error && typeof error === "object" && "code" in error) {
    const c = (error as { code?: unknown }).code;
    code = typeof c === "string" ? c : typeof c === "number" ? String(c) : undefined;
  }
  return code !== undefined ? { message, code } : { message };
}

function lower(s: string): string {
  return s.toLowerCase();
}

/**
 * Normalize errors from AVNU/starknet.js paymaster path.
 * Returns null if the error is not clearly a sponsorship-unavailability failure.
 */
export function normalizeAvnuSponsorshipError(
  raw: unknown
): NormalizedSponsorshipFailure | null {
  const { message, code } = messageAndCode(raw);
  const m = lower(message);

  // Config/setup: missing or invalid API key, auth, malformed endpoint
  if (
    m.includes("api key") ||
    m.includes("apikey") ||
    m.includes("api_key") ||
    (m.includes("missing") && (m.includes("key") || m.includes("auth") || m.includes("header"))) ||
    m.includes("invalid api key") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("401") ||
    m.includes("403") ||
    code === "401" ||
    code === "403" ||
    (m.includes("malformed") && m.includes("paymaster")) ||
    (m.includes("paymaster") && (m.includes("endpoint") || m.includes("config")))
  ) {
    return { reason: "invalid_paymaster_config", provider: "avnu" };
  }

  // Unsupported asset for sponsorship
  if (
    (m.includes("unsupported") && (m.includes("asset") || m.includes("token") || m.includes("gas"))) ||
    m.includes("asset not supported") ||
    m.includes("token not supported")
  ) {
    return { reason: "unsupported_asset", provider: "avnu" };
  }

  // Quota/limit
  if (
    m.includes("quota") ||
    m.includes("limit exceeded") ||
    m.includes("rate limit") ||
    m.includes("policy_exceeded") ||
    m.includes("exceeded")
  ) {
    return { reason: "policy_exceeded", provider: "avnu" };
  }

  // Network/paymaster outage
  if (
    (m.includes("network") && (m.includes("unavailable") || m.includes("error"))) ||
    m.includes("timeout") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("fetch failed") ||
    (m.includes("paymaster") && (m.includes("unavailable") || m.includes("down") || m.includes("outage")))
  ) {
    return { reason: "network_unavailable", provider: "avnu" };
  }

  // Policy rejected (e.g. not allowed for this call)
  if (m.includes("policy") && (m.includes("reject") || m.includes("denied"))) {
    return { reason: "policy_rejected", provider: "avnu" };
  }

  // Generic paymaster/sponsor failure that is not a normal revert
  if (
    m.includes("paymaster") ||
    m.includes("sponsor") ||
    (m.includes("sponsored") && (m.includes("fail") || m.includes("error")))
  ) {
    return { reason: "unknown", provider: "avnu" };
  }

  return null;
}

/**
 * Normalize errors from Cartridge controller/paymaster path.
 * Returns null if the error is not clearly a sponsorship-unavailability failure.
 */
export function normalizeCartridgeSponsorshipError(
  raw: unknown
): NormalizedSponsorshipFailure | null {
  const { message, code } = messageAndCode(raw);
  const m = lower(message);

  // Session/account not ready: disconnected, expired, not deployed in a way that blocks sponsorship
  if (
    m.includes("session") && (m.includes("expired") || m.includes("invalid") || m.includes("disconnect")) ||
    m.includes("account not ready") ||
    m.includes("account_not_ready") ||
    m.includes("not connected") ||
    m.includes("disconnected") ||
    m.includes("session expired")
  ) {
    return { reason: "account_not_ready", provider: "cartridge" };
  }

  // Config/auth: misconfigured controller, backend auth/config mismatch
  if (
    m.includes("misconfigured") ||
    m.includes("config") && (m.includes("fail") || m.includes("invalid")) ||
    m.includes("auth") && (m.includes("fail") || m.includes("mismatch")) ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    code === "401" ||
    code === "403" ||
    m.includes("backend") && (m.includes("refus") || m.includes("setup"))
  ) {
    return { reason: "invalid_paymaster_config", provider: "cartridge" };
  }

  // Policy rejected (e.g. missing or wrong session policy)
  if (
    m.includes("policy") && (m.includes("reject") || m.includes("denied") || m.includes("missing")) ||
    m.includes("session policy") ||
    m.includes("not allowed")
  ) {
    return { reason: "policy_rejected", provider: "cartridge" };
  }

  // Quota/limit
  if (
    m.includes("quota") ||
    m.includes("limit exceeded") ||
    m.includes("rate limit") ||
    m.includes("exceeded")
  ) {
    return { reason: "policy_exceeded", provider: "cartridge" };
  }

  // Unsupported asset
  if (
    m.includes("unsupported") && (m.includes("asset") || m.includes("token")) ||
    m.includes("asset not supported")
  ) {
    return { reason: "unsupported_asset", provider: "cartridge" };
  }

  // Transport/backend outage
  if (
    m.includes("network") && m.includes("unavailable") ||
    m.includes("transport") ||
    m.includes("backend") && (m.includes("outage") || m.includes("unavailable")) ||
    m.includes("timeout") ||
    m.includes("fetch failed")
  ) {
    return { reason: "network_unavailable", provider: "cartridge" };
  }

  return null;
}
