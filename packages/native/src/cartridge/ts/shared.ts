/**
 * Shared internal helpers for Cartridge TS modules.
 * Prefer importing these instead of redeclaring local copies.
 */
import { addAddressPadding, hash, num } from "starknet";
import { assertSafeHttpUrl } from "starkzap";
import { SessionProtocolError } from "@/cartridge/ts/errors";

export { assertSafeHttpUrl };

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

export interface FetchLikeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: unknown;
}

export type FetchLike = (
  input: string,
  init?: FetchLikeInit
) => Promise<FetchLikeResponse>;

export type UnknownRecord = Record<string, unknown>;

interface AbortControllerLike {
  signal: unknown;
  abort(): void;
}

export interface FetchWithTimeoutOptions {
  requestTimeoutMs: number;
  timeoutMessage: string;
  createTimeoutError(message: string, cause?: unknown): Error;
}

export const DEFAULT_REDIRECT_QUERY_NAME = "startapp";

/**
 * Narrows unknown JSON-like payloads to plain object records used by Cartridge TS parsing.
 */
export function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeFelt(value: string | number | bigint): string {
  return num.toHex(value).toLowerCase();
}

export function selectorFromEntrypoint(entrypoint: string): string {
  const trimmed = entrypoint.trim();
  if (!trimmed) {
    throw new SessionProtocolError("Call entrypoint cannot be empty.");
  }
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return normalizeFelt(trimmed);
  }
  return normalizeFelt(hash.getSelectorFromName(trimmed));
}

export function normalizeContractAddress(
  address: string,
  context?: string
): string {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new SessionProtocolError(
      context
        ? `${context} is missing a contract address.`
        : "Call contract address cannot be empty."
    );
  }
  try {
    return addAddressPadding(trimmed.toLowerCase());
  } catch (error) {
    throw new SessionProtocolError(
      context
        ? `${context} has an invalid address: ${address}`
        : `Invalid contract address: ${address}`,
      error
    );
  }
}

export function ensureFetch(
  fetchImpl: FetchLike | undefined,
  missingMessage: string,
  createMissingError: (message: string) => Error = (message) =>
    new Error(message)
): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof fetch === "function") {
    return fetch as unknown as FetchLike;
  }
  throw createMissingError(missingMessage);
}

function getAbortController(): (new () => AbortControllerLike) | undefined {
  const maybeAbortController = (
    globalThis as unknown as {
      AbortController?: new () => AbortControllerLike;
    }
  ).AbortController;
  return typeof maybeAbortController === "function"
    ? maybeAbortController
    : undefined;
}

export async function fetchWithTimeout(
  fetchFn: FetchLike,
  input: string,
  init: FetchLikeInit,
  options: FetchWithTimeoutOptions
): Promise<Awaited<ReturnType<FetchLike>>> {
  const { requestTimeoutMs, timeoutMessage, createTimeoutError } = options;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    return fetchFn(input, init);
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const clearRequestTimeout = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  };
  const createTimeoutPromise = (onTimeout?: () => void) =>
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        try {
          onTimeout?.();
        } finally {
          reject(createTimeoutError(timeoutMessage));
        }
      }, requestTimeoutMs);
    });
  const invokeFetch = (requestInit: FetchLikeInit) =>
    Promise.resolve().then(() => fetchFn(input, requestInit));
  const rethrowAbortLikeError = (error: unknown): never => {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || message.includes("abort")) {
      throw createTimeoutError(timeoutMessage, error);
    }
    throw error;
  };

  const AbortController = getAbortController();
  if (AbortController) {
    const controller = new AbortController();
    try {
      return await Promise.race([
        invokeFetch({
          ...init,
          signal: controller.signal,
        }),
        createTimeoutPromise(() => {
          controller.abort();
        }),
      ]);
    } catch (error) {
      rethrowAbortLikeError(error);
    } finally {
      clearRequestTimeout();
    }
  }

  try {
    return await Promise.race([invokeFetch(init), createTimeoutPromise()]);
  } finally {
    clearRequestTimeout();
  }
}
