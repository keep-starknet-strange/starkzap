/**
 * Shared internal helpers for Cartridge TS modules.
 * Prefer importing these instead of redeclaring local copies.
 */
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

/**
 * Narrows unknown JSON-like payloads to plain object records used by Cartridge TS parsing.
 */
export function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}
