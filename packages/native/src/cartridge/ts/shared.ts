/**
 * Shared internal helpers for Cartridge TS modules.
 * Prefer importing these instead of redeclaring local copies.
 */
import { addAddressPadding, hash, num } from "starknet";
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

/**
 * Narrows unknown JSON-like payloads to plain object records used by Cartridge TS parsing.
 */
export function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

/**
 * Normalize a felt value to a lowercase hex string.
 */
export function normalizeFelt(value: string | number | bigint): string {
  return num.toHex(value).toLowerCase();
}

/**
 * Derive a Starknet selector from an entrypoint name or hex selector.
 */
export function selectorFromEntrypoint(entrypoint: string): string {
  if (/^0x[0-9a-f]+$/i.test(entrypoint)) {
    return normalizeFelt(entrypoint);
  }
  return normalizeFelt(hash.getSelectorFromName(entrypoint));
}

/**
 * Normalize and pad a Starknet contract address.
 */
export function normalizeContractAddress(
  address: string,
  context: string
): string {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error(`${context} is missing a contract address.`);
  }

  try {
    return addAddressPadding(trimmed.toLowerCase());
  } catch (error) {
    const wrappedError = new Error(
      `${context} has an invalid address: ${address}`
    );
    if (error !== undefined) {
      Object.defineProperty(wrappedError, "cause", {
        value: error,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
    throw wrappedError;
  }
}

/**
 * Validate and normalize an HTTP(S) URL, stripping trailing slashes.
 */
export function normalizeHttpUrl(value: string, label: string): string {
  return assertSafeHttpUrl(value, label).toString().replace(/\/+$/, "");
}

/**
 * Validate and normalize an HTTP(S) URL.
 */
export function assertSafeHttpUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  const protocol = parsed.protocol.toLowerCase();

  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error(`${label} must use http:// or https://`);
  }

  return parsed;
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

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const clearRequestTimeout = () => clearTimeout(timeoutId);
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
