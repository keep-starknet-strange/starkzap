import { assertSafeHttpUrl } from "@/utils";
import { type EthereumBridgeProtocol, Protocol } from "@/types/bridge/protocol";
import { ExternalChain } from "@/types/bridge/external-chain";
import {
  type BridgeToken,
  EthereumBridgeToken,
  SolanaBridgeToken,
} from "@/types/bridge/bridge-token";
import { type EthereumAddress, type SolanaAddress, fromAddress } from "@/types";
import { loadEthers } from "@/connect/ethersRuntime";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";
import { fromSolanaAddress } from "@/types/solanaAddress";

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
  id?: string;
  chain?: string;
  protocol?: string;
  name?: string;
  symbol?: string;
  coingecko_id?: string;
  symbol_hex?: string;
  deprecated?: boolean;
  hidden?: boolean;
  decimals?: number;
  l1_token_address?: string;
  l2_token_address?: string;
  l1_bridge_address?: string;
  l2_bridge_address?: string;
  l2_fee_token_address?: string;
  bitcoin_runes_id?: string;
}

const DEFAULT_ENV: BridgeTokenApiEnv = "mainnet";
export const STARKGATE_TOKENS_API_URL =
  "https://starkgate.starknet.io/tokens/api/tokens";
export const BRIDGE_TOKEN_CACHE_TTL_MS = 60 * 60 * 1000;

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
    default:
      throw new Error(`Unsupported chain "${chain}"`);
  }
}

function parseProtocol(protocol: string): Protocol {
  switch (protocol.toLowerCase().replace(/_/g, "-")) {
    case Protocol.CANONICAL:
      return Protocol.CANONICAL;
    case Protocol.CCTP:
      return Protocol.CCTP;
    case Protocol.OFT:
      return Protocol.OFT;
    case Protocol.OFT_MIGRATED:
      return Protocol.OFT_MIGRATED;
    case Protocol.HYPERLANE:
      return Protocol.HYPERLANE;
    default:
      throw new Error(`Unsupported protocol "${protocol}"`);
  }
}

const isNonNull = <T>(value: T | null): value is T => value !== null;

type NormalizeEthereumAddress = (value: string) => EthereumAddress;
type NormalizeSolanaAddress = (value: string) => SolanaAddress;

function getTokenChain(token: BridgeTokenApiRecord): ExternalChain | null {
  if (typeof token.chain !== "string") {
    return null;
  }
  try {
    return parseChain(token.chain);
  } catch {
    return null;
  }
}

function isOptionalPeerDependencyError(
  error: unknown,
  dependency: "ethers" | "@solana/web3.js"
): error is Error {
  return (
    error instanceof Error &&
    error.message.includes(`optional peer dependency "${dependency}"`)
  );
}

function parseToken(
  token: BridgeTokenApiRecord,
  normalizeEthereumAddress?: NormalizeEthereumAddress,
  normalizeSolanaAddress?: NormalizeSolanaAddress
): BridgeToken {
  const chain = parseChain(requiredString(token, "chain"));
  const protocol = parseProtocol(requiredString(token, "protocol"));

  if (chain === ExternalChain.ETHEREUM) {
    if (!normalizeEthereumAddress) {
      throw new Error(
        'Ethereum token parsing requires "ethers" optional peer dependency.'
      );
    }

    if (
      protocol !== Protocol.CANONICAL &&
      protocol !== Protocol.CCTP &&
      protocol !== Protocol.OFT &&
      protocol !== Protocol.OFT_MIGRATED
    ) {
      throw new Error(
        `Invalid protocol "${protocol}" for chain "${ExternalChain.ETHEREUM}"`
      );
    }
    const coingeckoId = optionalString(token, "coingecko_id");

    return new EthereumBridgeToken({
      id: requiredString(token, "id"),
      name: requiredString(token, "name"),
      symbol: requiredString(token, "symbol"),
      decimals: requiredNumber(token, "decimals"),
      protocol: protocol as EthereumBridgeProtocol,
      address: normalizeEthereumAddress(
        requiredString(token, "l1_token_address")
      ),
      l1Bridge: normalizeEthereumAddress(
        requiredString(token, "l1_bridge_address")
      ),
      starknetAddress: fromAddress(requiredString(token, "l2_token_address")),
      starknetBridge: fromAddress(requiredString(token, "l2_bridge_address")),
      ...(coingeckoId ? { coingeckoId } : {}),
    });
  }

  if (chain === ExternalChain.SOLANA) {
    if (!normalizeSolanaAddress) {
      throw new Error(
        'Solana token parsing requires "@solana/web3.js" optional peer dependency.'
      );
    }

    if (protocol !== Protocol.HYPERLANE) {
      throw new Error(
        `Invalid protocol "${protocol}" for chain "${ExternalChain.SOLANA}"`
      );
    }

    return new SolanaBridgeToken({
      id: requiredString(token, "id"),
      name: requiredString(token, "name"),
      symbol: requiredString(token, "symbol"),
      decimals: requiredNumber(token, "decimals"),
      protocol: Protocol.HYPERLANE,
      address: normalizeSolanaAddress(
        requiredString(token, "l1_token_address")
      ),
      l1Bridge: normalizeSolanaAddress(
        requiredString(token, "l1_bridge_address")
      ),
      starknetAddress: fromAddress(requiredString(token, "l2_token_address")),
      starknetBridge: fromAddress(requiredString(token, "l2_bridge_address")),
    });
  }

  throw new Error(`Chain "${chain} not supported"`);
}

function buildCacheKey(query: BridgeTokenQuery): string {
  return `${query.env ?? DEFAULT_ENV}:${query.chain ?? "all"}`;
}

function assertArrayPayload(payload: unknown): BridgeTokenApiRecord[] {
  if (Array.isArray(payload)) {
    return payload as BridgeTokenApiRecord[];
  }

  const received = payload === null ? "null" : typeof payload;
  throw new Error(
    `Invalid bridge tokens API response: expected a top-level array, received ${received}.`
  );
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
      return [...cached.tokens];
    }

    const inFlight = this.inflight.get(key);
    if (inFlight) {
      return [...(await inFlight)];
    }

    const request = this.fetchAndCache(query, key);
    this.inflight.set(key, request);

    try {
      return [...(await request)];
    } finally {
      this.inflight.delete(key);
    }
  }

  private async fetchAndCache(
    query: BridgeTokenQuery,
    key: string
  ): Promise<BridgeToken[]> {
    const isExplicitChainRequest = query.chain !== undefined;
    const url = new URL(this.apiUrl);
    url.searchParams.set("env", query.env ?? DEFAULT_ENV);
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

    const payload = assertArrayPayload(await response.json());
    const visiblePayload = payload.filter((token) => {
      return !token.hidden && !token.deprecated;
    });
    const scopedPayload = query.chain
      ? visiblePayload.filter((token) => getTokenChain(token) === query.chain)
      : visiblePayload;

    const hasEthereumRows = scopedPayload.some((token) => {
      return getTokenChain(token) === ExternalChain.ETHEREUM;
    });
    const hasSolanaRows = scopedPayload.some((token) => {
      return getTokenChain(token) === ExternalChain.SOLANA;
    });
    const unavailableChains = new Set<ExternalChain>();
    let ethers: Awaited<ReturnType<typeof loadEthers>> | undefined;
    let solanaWeb3: Awaited<ReturnType<typeof loadSolanaWeb3>> | undefined;

    if (hasEthereumRows) {
      if (query.chain === ExternalChain.ETHEREUM) {
        ethers = await loadEthers("Bridge token parsing");
      } else {
        try {
          ethers = await loadEthers("Bridge token parsing");
        } catch (error) {
          if (!isOptionalPeerDependencyError(error, "ethers")) {
            throw error;
          }
          unavailableChains.add(ExternalChain.ETHEREUM);
          console.warn(
            '[starkzap] Skipping ethereum bridge tokens because optional peer dependency "ethers" is not installed.',
            error
          );
        }
      }
    }

    if (hasSolanaRows) {
      if (query.chain === ExternalChain.SOLANA) {
        solanaWeb3 = await loadSolanaWeb3("Bridge token parsing");
      } else {
        try {
          solanaWeb3 = await loadSolanaWeb3("Bridge token parsing");
        } catch (error) {
          if (!isOptionalPeerDependencyError(error, "@solana/web3.js")) {
            throw error;
          }
          unavailableChains.add(ExternalChain.SOLANA);
          console.warn(
            '[starkzap] Skipping solana bridge tokens because optional peer dependency "@solana/web3.js" is not installed.',
            error
          );
        }
      }
    }

    const normalizeEthereumAddress = ethers
      ? (value: string) => fromEthereumAddress(value, ethers)
      : undefined;
    const normalizeSolanaAddress = solanaWeb3
      ? (value: string) => fromSolanaAddress(value, solanaWeb3)
      : undefined;

    const tokens = scopedPayload
      .filter((token) => {
        if (isExplicitChainRequest) {
          return true;
        }

        const chain = getTokenChain(token);
        return chain === null || !unavailableChains.has(chain);
      })
      .map((token) => {
        try {
          return parseToken(
            token,
            normalizeEthereumAddress,
            normalizeSolanaAddress
          );
        } catch (e) {
          if (isExplicitChainRequest) {
            throw e;
          }
          console.warn(`Ignoring token ${token.symbol} due to`, e);
          return null;
        }
      })
      .filter(isNonNull);

    this.cache.set(key, {
      tokens,
      expiresAt: this.now() + this.cacheTtlMs,
    });

    return tokens;
  }
}
