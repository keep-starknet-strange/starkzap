import { assertSafeHttpUrl } from "@/utils";
import { BridgeProtocol } from "@/bridge/bridge-protocol";
import { ExternalChain } from "@/bridge/external-chain";
import {
  type BridgeToken,
  BitcoinRunesBridgeToken,
  EthereumBridgeToken,
  type EthereumBridgeProtocol,
  SolanaBridgeToken,
} from "@/bridge/token";

export type BridgeTokenApiEnv = "mainnet" | "testnet";

export interface BridgeTokenQuery {
  env?: BridgeTokenApiEnv;
  chain?: ExternalChain;
}

export interface BridgeTokenRepositoryOptions {
  apiUrl?: string;
  cacheTtlMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface CacheEntry {
  tokens: BridgeToken[];
  expiresAt: number;
}

interface BridgeTokenApiRecord {
  id?: unknown;
  chain?: unknown;
  protocol?: unknown;
  name?: unknown;
  symbol?: unknown;
  coingecko_id?: unknown;
  decimals?: unknown;
  l1_token_address?: unknown;
  l2_token_address?: unknown;
  l1_bridge_address?: unknown;
  l2_fee_token_address?: unknown;
  bitcoin_runes_id?: unknown;
  l2_token_bridge?: unknown;
}

const DEFAULT_ENV: BridgeTokenApiEnv = "mainnet";
export const STARKGATE_TOKENS_API_URL =
  "https://starkgate.starknet.io/tokens/api/tokens";
export const BRIDGE_TOKEN_CACHE_TTL_MS = 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(
  token: BridgeTokenApiRecord,
  field: keyof BridgeTokenApiRecord
): string {
  const value = token[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required field "${field}"`);
  }
  return value.trim();
}

function optionalString(
  token: BridgeTokenApiRecord,
  field: keyof BridgeTokenApiRecord
): string | undefined {
  const value = token[field];
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function requiredNumber(
  token: BridgeTokenApiRecord,
  field: keyof BridgeTokenApiRecord
): number {
  const value = token[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Missing required field "${field}"`);
}

function parseChain(chain: string): ExternalChain {
  switch (chain.toLowerCase()) {
    case ExternalChain.ETHEREUM:
      return ExternalChain.ETHEREUM;
    case ExternalChain.SOLANA:
      return ExternalChain.SOLANA;
    case ExternalChain.BITCOIN_RUNES:
      return ExternalChain.BITCOIN_RUNES;
    default:
      throw new Error(`Unsupported chain "${chain}"`);
  }
}

function parseProtocol(protocol: string): BridgeProtocol {
  switch (protocol.toLowerCase().replace(/_/g, "-")) {
    case BridgeProtocol.CANONICAL:
      return BridgeProtocol.CANONICAL;
    case BridgeProtocol.CCTP:
      return BridgeProtocol.CCTP;
    case BridgeProtocol.OFT:
      return BridgeProtocol.OFT;
    case BridgeProtocol.OFT_MIGRATED:
      return BridgeProtocol.OFT_MIGRATED;
    case BridgeProtocol.HYPERLANE:
      return BridgeProtocol.HYPERLANE;
    case BridgeProtocol.BITCOIN_RUNES:
      return BridgeProtocol.BITCOIN_RUNES;
    default:
      throw new Error(`Unsupported protocol "${protocol}"`);
  }
}

function parseToken(token: BridgeTokenApiRecord): BridgeToken {
  const chain = parseChain(requiredString(token, "chain"));
  const protocol = parseProtocol(requiredString(token, "protocol"));

  const coingeckoId = optionalString(token, "coingecko_id");
  const base = {
    id: requiredString(token, "id"),
    name: requiredString(token, "name"),
    symbol: requiredString(token, "symbol"),
    decimals: requiredNumber(token, "decimals"),
    l2TokenAddress: requiredString(token, "l2_token_address"),
    ...(coingeckoId ? { coingeckoId } : {}),
  };

  if (chain === ExternalChain.ETHEREUM) {
    if (
      protocol !== BridgeProtocol.CANONICAL &&
      protocol !== BridgeProtocol.CCTP &&
      protocol !== BridgeProtocol.OFT &&
      protocol !== BridgeProtocol.OFT_MIGRATED
    ) {
      throw new Error(
        `Invalid protocol "${protocol}" for chain "${ExternalChain.ETHEREUM}"`
      );
    }

    const l2FeeTokenAddress = optionalString(token, "l2_fee_token_address");
    return new EthereumBridgeToken({
      ...base,
      protocol: protocol as EthereumBridgeProtocol,
      l1TokenAddress: requiredString(token, "l1_token_address"),
      l1BridgeAddress: requiredString(token, "l1_bridge_address"),
      ...(l2FeeTokenAddress ? { l2FeeTokenAddress } : {}),
    });
  }

  if (chain === ExternalChain.SOLANA) {
    if (protocol !== BridgeProtocol.HYPERLANE) {
      throw new Error(
        `Invalid protocol "${protocol}" for chain "${ExternalChain.SOLANA}"`
      );
    }

    return new SolanaBridgeToken({
      ...base,
      protocol: BridgeProtocol.HYPERLANE,
      solanaTokenAddress: requiredString(token, "l1_token_address"),
      solanaDecimals: base.decimals,
    });
  }

  if (protocol !== BridgeProtocol.BITCOIN_RUNES) {
    throw new Error(
      `Invalid protocol "${protocol}" for chain "${ExternalChain.BITCOIN_RUNES}"`
    );
  }

  return new BitcoinRunesBridgeToken({
    ...base,
    protocol: BridgeProtocol.BITCOIN_RUNES,
    bitcoinRuneId: requiredString(token, "bitcoin_runes_id"),
    runesBridgeAddress: requiredString(token, "l2_token_bridge"),
  });
}

function extractTokenRecords(payload: unknown): BridgeTokenApiRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (isRecord(payload) && Array.isArray(payload.tokens)) {
    return payload.tokens.filter(isRecord);
  }

  throw new Error("Unexpected bridge token API response shape");
}

function buildCacheKey(query: BridgeTokenQuery): string {
  return `${query.env ?? DEFAULT_ENV}:${query.chain ?? "all"}`;
}

function cloneTokens(tokens: BridgeToken[]): BridgeToken[] {
  return [...tokens];
}

export class BridgeTokenRepository {
  private readonly apiUrl: string;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<BridgeToken[]>>();

  constructor(options: BridgeTokenRepositoryOptions = {}) {
    this.apiUrl = assertSafeHttpUrl(
      options.apiUrl ?? STARKGATE_TOKENS_API_URL,
      "Bridge token API URL"
    ).toString();

    this.cacheTtlMs = options.cacheTtlMs ?? BRIDGE_TOKEN_CACHE_TTL_MS;
    if (!Number.isFinite(this.cacheTtlMs) || this.cacheTtlMs <= 0) {
      throw new Error("cacheTtlMs must be a positive finite number");
    }

    if (options.fetchFn) {
      this.fetchFn = options.fetchFn;
    } else if (typeof globalThis.fetch === "function") {
      this.fetchFn = globalThis.fetch.bind(globalThis) as typeof fetch;
    } else {
      throw new Error(
        "No fetch implementation available. Provide fetchFn in BridgeTokenRepositoryOptions."
      );
    }

    this.now = options.now ?? Date.now;
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  async getTokens(query: BridgeTokenQuery = {}): Promise<BridgeToken[]> {
    const key = buildCacheKey(query);
    const cached = this.cache.get(key);
    const now = this.now();

    if (cached && cached.expiresAt > now) {
      return cloneTokens(cached.tokens);
    }

    const inFlight = this.inflight.get(key);
    if (inFlight) {
      return cloneTokens(await inFlight);
    }

    const request = this.fetchAndCache(query, key, now);
    this.inflight.set(key, request);

    try {
      return cloneTokens(await request);
    } finally {
      this.inflight.delete(key);
    }
  }

  private async fetchAndCache(
    query: BridgeTokenQuery,
    key: string,
    now: number
  ): Promise<BridgeToken[]> {
    const url = new URL(this.apiUrl);
    if (query.env) {
      url.searchParams.set("env", query.env);
    }
    if (query.chain) {
      url.searchParams.set("chain", query.chain);
    }

    const response = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch bridge tokens: ${response.status} ${response.statusText}`
      );
    }

    const payload: unknown = await response.json();
    const tokens = extractTokenRecords(payload).map(parseToken);

    this.cache.set(key, {
      tokens,
      expiresAt: now + this.cacheTtlMs,
    });

    return tokens;
  }
}
