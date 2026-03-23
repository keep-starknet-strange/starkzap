import { addAddressPadding } from "starknet";
import {
  SessionProtocolError,
  SessionRejectedError,
  SessionTimeoutError,
} from "@/cartridge/ts/errors";
import {
  asRecord,
  ensureFetch,
  fetchWithTimeout,
  normalizeHttpUrl,
  type FetchLike,
} from "@/cartridge/ts/shared";
import type { CartridgePolicies } from "@/cartridge/types";
import {
  hasPoliciesInput,
  policiesToSessionUrlShape,
} from "@/cartridge/ts/policy";

// Telegram Mini App convention: "startapp" carries the deep-link payload in Telegram WebApp redirects.
const DEFAULT_REDIRECT_QUERY_NAME = "startapp";
const SUBSCRIBE_CREATE_SESSION_QUERY = `query SubscribeCreateSession($sessionKeyGuid: Felt!) {
  subscribeCreateSession(sessionKeyGuid: $sessionKeyGuid) {
    id
    appID
    chainID
    isRevoked
    createdAt
    updatedAt
    controller {
      address
      accountID
    }
    expiresAt
    metadataHash
    sessionKeyGuid
    guardianKeyGuid
    authorization
  }
}`;

export interface SessionRegistration {
  username: string;
  address: string;
  ownerGuid: string;
  expiresAt: string;
  guardianKeyGuid: string;
  metadataHash: string;
  sessionKeyGuid: string;
  authorization?: string[];
  chainId?: string;
  appId?: string;
  isRevoked?: boolean;
}

export interface BuildSessionUrlOptions {
  baseUrl: string;
  publicKey: string;
  policies?: CartridgePolicies;
  rpcUrl: string;
  preset?: string;
  needsSessionCreation?: boolean;
  redirectUrl?: string;
  redirectQueryName?: string;
}

export interface WaitForSessionSubscriptionOptions {
  cartridgeApiUrl: string;
  sessionKeyGuid: string;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

type GraphQLSubscribeSessionResult = {
  data?: {
    subscribeCreateSession?: {
      appID?: string;
      chainID?: string;
      isRevoked?: boolean;
      controller?: {
        address?: string;
        accountID?: string;
      };
      expiresAt?: string;
      metadataHash?: string;
      sessionKeyGuid?: string;
      guardianKeyGuid?: string;
      authorization?: string[];
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function padBase64(value: string): string {
  const remainder = value.length % 4;
  if (remainder === 0) {
    return value;
  }
  return `${value}${"=".repeat(4 - remainder)}`;
}

function normalizeBase64Input(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  return decoded.replace(/-/g, "+").replace(/_/g, "/");
}

function decodeBase64(value: string): string {
  const padded = padBase64(normalizeBase64Input(value));
  if (typeof atob === "function") {
    return atob(padded);
  }
  const globalBuffer = (
    globalThis as unknown as {
      Buffer?: {
        from(
          input: string,
          encoding: string
        ): { toString(encoding: string): string };
      };
    }
  ).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(padded, "base64").toString("utf8");
  }
  throw new SessionProtocolError(
    "No base64 decoder available in this runtime for Cartridge session redirects."
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toOptionalString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function readAuthorization(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const normalized = values
    .map(toOptionalString)
    .filter((value): value is string => Boolean(value));
  return normalized.length > 0 ? normalized : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function readSupportedUsername(record: Record<string, unknown>): string {
  const controller = asRecord(record.controller);
  return (
    toOptionalString(record.username) ??
    toOptionalString(controller?.accountID) ??
    ""
  );
}

function readSupportedAddress(record: Record<string, unknown>): string {
  const controller = asRecord(record.controller);
  return (
    toOptionalString(record.address) ??
    toOptionalString(controller?.address) ??
    ""
  );
}

function normalizeSessionRegistration(session: unknown): SessionRegistration {
  const record = asRecord(session);
  if (!record) {
    throw new SessionProtocolError(
      "Cartridge session redirect payload has an invalid structure."
    );
  }

  const authorization = readAuthorization(record.authorization);
  const username = readSupportedUsername(record);
  const rawAddress = readSupportedAddress(record);
  const ownerGuid =
    toOptionalString(record.ownerGuid) ?? authorization?.[1] ?? "";
  const expiresAt = toOptionalString(record.expiresAt) ?? "";
  const guardianKeyGuid = toOptionalString(record.guardianKeyGuid) ?? "0x0";
  const metadataHash = toOptionalString(record.metadataHash) ?? "0x0";
  const sessionKeyGuid =
    toOptionalString(record.sessionKeyGuid) ??
    toOptionalString(record.id) ??
    "";
  const chainId =
    toOptionalString(record.chainId) ?? toOptionalString(record.chainID) ?? "";
  const appId =
    toOptionalString(record.appId) ?? toOptionalString(record.appID) ?? "";
  const isRevoked = readBoolean(record.isRevoked);

  const missingFields: string[] = [];
  if (!username) missingFields.push("username");
  if (!rawAddress) missingFields.push("address");
  if (!ownerGuid) missingFields.push("ownerGuid");
  if (!expiresAt) missingFields.push("expiresAt");
  if (!sessionKeyGuid) missingFields.push("sessionKeyGuid");

  if (missingFields.length > 0) {
    throw new SessionProtocolError(
      `Malformed Cartridge session payload; missing required fields: ${missingFields.join(", ")}.`
    );
  }

  let address = rawAddress;
  try {
    address = addAddressPadding(rawAddress.toLowerCase());
  } catch (error) {
    throw new SessionProtocolError(
      `Invalid session address received from Cartridge: ${rawAddress}`,
      error
    );
  }

  return {
    username,
    address,
    ownerGuid,
    expiresAt,
    guardianKeyGuid,
    metadataHash,
    sessionKeyGuid,
    ...(authorization ? { authorization } : {}),
    ...(chainId ? { chainId } : {}),
    ...(appId ? { appId } : {}),
    ...(isRevoked !== undefined ? { isRevoked } : {}),
  };
}

// Exponential-ish backoff for session subscription polling, capped at 5s.
function nextDelayMs(attempt: number): number {
  if (attempt <= 0) return 500;
  if (attempt === 1) return 1000;
  if (attempt === 2) return 2000;
  return 5000;
}

export function buildCartridgeSessionUrl({
  baseUrl,
  publicKey,
  policies,
  rpcUrl,
  preset,
  needsSessionCreation,
  redirectUrl,
  redirectQueryName = DEFAULT_REDIRECT_QUERY_NAME,
}: BuildSessionUrlOptions): string {
  const normalizedBaseUrl = normalizeHttpUrl(baseUrl, "baseUrl");
  const params = new URLSearchParams({
    public_key: publicKey,
    rpc_url: rpcUrl,
  });

  if (policies && hasPoliciesInput(policies)) {
    params.set("policies", JSON.stringify(policiesToSessionUrlShape(policies)));
  }

  if (preset) {
    params.set("preset", preset);
  }

  if (!hasPoliciesInput(policies) && !preset) {
    throw new SessionProtocolError(
      "Cartridge session URL requires either policies or a preset."
    );
  }

  if (needsSessionCreation) {
    params.set("needs_session_creation", "true");
  }

  if (redirectUrl) {
    params.set("redirect_uri", redirectUrl);
    params.set("redirect_query_name", redirectQueryName);
  }

  return `${normalizedBaseUrl}/session?${params.toString()}`;
}

export function parseSessionFromEncodedRedirect(
  encodedSession: string,
  options: {
    defaultSessionKeyGuid?: string;
  } = {}
): SessionRegistration {
  let raw: string;
  try {
    raw = decodeBase64(encodedSession);
  } catch (error) {
    if (error instanceof SessionProtocolError) {
      throw error;
    }
    throw new SessionProtocolError(
      "Cartridge session redirect payload is not valid base64.",
      error
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SessionProtocolError(
      "Cartridge session redirect payload is not valid JSON.",
      error
    );
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new SessionProtocolError(
      "Cartridge session redirect payload has an invalid structure."
    );
  }

  if (!record.sessionKeyGuid && !record.id) {
    if (options.defaultSessionKeyGuid) {
      record.sessionKeyGuid = options.defaultSessionKeyGuid;
    }
  }

  return normalizeSessionRegistration(record);
}

export function extractEncodedSessionFromUrl(
  url: string,
  queryName: string = DEFAULT_REDIRECT_QUERY_NAME
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new SessionProtocolError(
      `Cartridge callback URL is not a valid URL: ${url}`,
      error
    );
  }
  const value = parsed.searchParams.get(queryName);
  return value && value.length > 0 ? value : null;
}

export async function waitForSessionSubscription({
  cartridgeApiUrl,
  sessionKeyGuid,
  timeoutMs = 180_000,
  requestTimeoutMs = 15_000,
  fetchImpl,
}: WaitForSessionSubscriptionOptions): Promise<SessionRegistration> {
  const normalizedCartridgeApiUrl = normalizeHttpUrl(
    cartridgeApiUrl,
    "cartridgeApiUrl"
  );
  const fetchFn = ensureFetch(
    fetchImpl,
    "No fetch implementation available for Cartridge session subscription.",
    (message) => new SessionProtocolError(message)
  );
  const startedAt = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      break;
    }
    const requestBudgetMs =
      requestTimeoutMs > 0
        ? Math.min(requestTimeoutMs, remainingMs)
        : remainingMs;

    try {
      const response = await fetchWithTimeout(
        fetchFn,
        normalizedCartridgeApiUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: SUBSCRIBE_CREATE_SESSION_QUERY,
            variables: {
              sessionKeyGuid,
            },
          }),
        },
        {
          requestTimeoutMs: requestBudgetMs,
          timeoutMessage: `Cartridge session subscription request timed out after ${requestBudgetMs}ms.`,
          createTimeoutError: (message, cause) =>
            new SessionProtocolError(message, cause),
        }
      );

      if (!response.ok) {
        throw new SessionProtocolError(
          `Cartridge session subscription failed with HTTP ${response.status} ${response.statusText}.`
        );
      }

      const payload = (await response.json()) as GraphQLSubscribeSessionResult;
      const node = payload.data?.subscribeCreateSession;
      if (node) {
        if (node.isRevoked) {
          throw new SessionRejectedError(
            "Cartridge session is revoked and cannot be used."
          );
        }

        const ownerGuid = node.authorization?.[1];
        if (!ownerGuid) {
          throw new SessionRejectedError(
            "Cartridge session subscription is missing owner GUID authorization."
          );
        }

        return normalizeSessionRegistration({
          ...(node.controller?.accountID
            ? { username: node.controller.accountID }
            : {}),
          ...(node.controller?.address
            ? { address: node.controller.address }
            : {}),
          ownerGuid,
          ...(node.expiresAt ? { expiresAt: node.expiresAt } : {}),
          guardianKeyGuid: node.guardianKeyGuid ?? "0x0",
          metadataHash: node.metadataHash ?? "0x0",
          sessionKeyGuid: node.sessionKeyGuid ?? sessionKeyGuid,
          ...(node.authorization ? { authorization: node.authorization } : {}),
          ...(node.appID ? { appId: node.appID } : {}),
          ...(node.chainID ? { chainId: node.chainID } : {}),
          ...(node.isRevoked !== undefined
            ? { isRevoked: node.isRevoked }
            : {}),
        });
      }

      if (payload.errors && payload.errors.length > 0) {
        const message = payload.errors
          .map((error) => error.message ?? "Unknown GraphQL error")
          .join("; ");
        // GraphQL validation error — permanent, do not retry.
        throw new SessionRejectedError(
          `Cartridge session subscription returned GraphQL errors: ${message}`
        );
      }
    } catch (error) {
      if (error instanceof SessionRejectedError) {
        throw error;
      }
      lastError = error;
    }

    const remainingDelayBudgetMs = timeoutMs - (Date.now() - startedAt);
    if (remainingDelayBudgetMs <= 0) {
      break;
    }

    const delayMs = Math.min(nextDelayMs(attempt), remainingDelayBudgetMs);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    attempt += 1;
  }

  throw new SessionTimeoutError(
    "Timed out waiting for Cartridge session subscription result.",
    lastError
  );
}
