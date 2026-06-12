import { assertSafeHttpUrl, resolveFetch } from "@/utils";
import { type EthereumBridgeProtocol, Protocol } from "@/types/bridge/protocol";
import {
  type BridgeEnv,
  ExternalChain,
  NATIVE_TOKEN_ADDRESS,
} from "@/types/bridge/external-chain";
import {
  type BridgeToken,
  ContractRoutedEthereumBridgeToken,
  ContractRoutedSolanaBridgeToken,
  EthereumBridgeToken,
  SolanaBridgeToken,
} from "@/types/bridge/bridge-token";
import { type EthereumAddress, type SolanaAddress, fromAddress } from "@/types";
import { loadEthers } from "@/connect/ethersRuntime";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";
import { fromSolanaAddress } from "@/types/solanaAddress";
import { type StarkZapLogger, NOOP_LOGGER } from "@/logger";
import { LayerswapApi } from "@/bridge/ethereum/layerswap/LayerswapApi";
import { resolveLayerswapRoute } from "@/bridge/ethereum/layerswap/networks";
import type {
  LayerswapTokenSource,
  LsToken,
} from "@/bridge/ethereum/layerswap/types";

export type BridgeTokenApiEnv = BridgeEnv;

export interface BridgeTokenQuery {
  env?: BridgeTokenApiEnv;
  chain?: ExternalChain;
}

export interface BridgeTokenRepositoryOptions {
  apiUrl?: string;
  cacheTtlMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
  logger?: StarkZapLogger;
  /**
   * Layerswap API key. Layerswap tokens are sourced exclusively from the
   * Layerswap API, so the key is required — unless a pre-built
   * `layerswapApi` source is injected instead.
   */
  layerswapApiKey?: string;
  /**
   * Custom Layerswap API base URL. Defaults to the public endpoint.
   */
  layerswapBaseUrl?: string;
  /**
   * Pre-built Layerswap token source. Overrides `layerswapApiKey`/
   * `layerswapBaseUrl`; primarily an injection seam for tests.
   */
  layerswapApi?: LayerswapTokenSource;
}

interface CacheEntry {
  tokens: BridgeToken[];
  expiresAt: number;
}

/**
 * Layerswap discovery outcome. `degraded` marks a transient failure (network
 * error, timeout) that emptied the contribution — distinct from a genuinely
 * empty result — so the cache entry can expire early and retry.
 */
interface LayerswapDiscoveryResult {
  tokens: BridgeToken[];
  degraded: boolean;
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
  AW_support?: boolean;
}

const DEFAULT_ENV: BridgeTokenApiEnv = "mainnet";
export const STARKGATE_TOKENS_API_URL =
  "https://starkgate.starknet.io/tokens/api/tokens";
export const BRIDGE_TOKEN_CACHE_TTL_MS = 60 * 60 * 1000;
/**
 * Cache TTL applied when the Layerswap contribution degraded to empty on a
 * transient failure. Short, so the missing tokens reappear soon after the
 * Layerswap API recovers instead of being pinned out for the full TTL.
 */
export const LAYERSWAP_DEGRADED_CACHE_TTL_MS = 60 * 1000;

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
    case Protocol.LAYERSWAP:
      return Protocol.LAYERSWAP;
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

/**
 * Whether a token's bridge-contract addresses are actually consumed by its
 * bridge class. Canonical, Lords, OFT (Ethereum) and Hyperlane (Solana) build a
 * bridge `Contract` from these addresses, so they become required fields on the
 * `ContractRouted*` token classes.
 *
 * Layerswap and CCTP are excluded: Layerswap derives a per-swap deposit address
 * from its API, and CCTP resolves its TokenMessenger/MessageTransmitter from
 * chain-keyed constants rather than the token record. Both ignore any
 * bridge-contract addresses, so their records parse to the plain base token
 * classes — the distinction is encoded in the type system instead of asserted at
 * runtime.
 */
function isContractRouted(protocol: Protocol): boolean {
  return protocol !== Protocol.LAYERSWAP && protocol !== Protocol.CCTP;
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
      protocol !== Protocol.OFT_MIGRATED &&
      protocol !== Protocol.LAYERSWAP
    ) {
      throw new Error(
        `Invalid protocol "${protocol}" for chain "${ExternalChain.ETHEREUM}"`
      );
    }
    const coingeckoId = optionalString(token, "coingecko_id");
    const params = {
      id: requiredString(token, "id"),
      name: requiredString(token, "name"),
      symbol: requiredString(token, "symbol"),
      decimals: requiredNumber(token, "decimals"),
      protocol: protocol as EthereumBridgeProtocol,
      address: normalizeEthereumAddress(
        requiredString(token, "l1_token_address")
      ),
      starknetAddress: fromAddress(requiredString(token, "l2_token_address")),
      supportsAutoWithdraw: token.AW_support === true,
      ...(coingeckoId ? { coingeckoId } : {}),
    };

    return isContractRouted(protocol)
      ? new ContractRoutedEthereumBridgeToken({
          ...params,
          l1Bridge: normalizeEthereumAddress(
            requiredString(token, "l1_bridge_address")
          ),
          starknetBridge: fromAddress(
            requiredString(token, "l2_bridge_address")
          ),
        })
      : new EthereumBridgeToken(params);
  }

  if (chain === ExternalChain.SOLANA) {
    if (!normalizeSolanaAddress) {
      throw new Error(
        'Solana token parsing requires "@solana/web3.js" optional peer dependency.'
      );
    }

    if (protocol !== Protocol.HYPERLANE && protocol !== Protocol.LAYERSWAP) {
      throw new Error(
        `Invalid protocol "${protocol}" for chain "${ExternalChain.SOLANA}"`
      );
    }

    const params = {
      id: requiredString(token, "id"),
      name: requiredString(token, "name"),
      symbol: requiredString(token, "symbol"),
      decimals: requiredNumber(token, "decimals"),
      protocol,
      address: normalizeSolanaAddress(
        requiredString(token, "l1_token_address")
      ),
      starknetAddress: fromAddress(requiredString(token, "l2_token_address")),
    };

    return isContractRouted(protocol)
      ? new ContractRoutedSolanaBridgeToken({
          ...params,
          l1Bridge: normalizeSolanaAddress(
            requiredString(token, "l1_bridge_address")
          ),
          starknetBridge: fromAddress(
            requiredString(token, "l2_bridge_address")
          ),
        })
      : new SolanaBridgeToken(params);
  }

  throw new Error(`Chain "${chain} not supported"`);
}

/** Shared fields for a discovered Layerswap token. */
function layerswapTokenBase(
  chain: ExternalChain,
  externalToken: LsToken,
  starknetContract: string
) {
  return {
    // Chain-qualified so same-symbol tokens on different chains (e.g. Ethereum
    // and Solana USDC) get distinct ids — consumers look tokens up by id alone.
    id: `${externalToken.symbol.toLowerCase()}-${chain}-${Protocol.LAYERSWAP}`,
    name: externalToken.display_asset ?? externalToken.symbol,
    symbol: externalToken.symbol,
    decimals: externalToken.decimals,
    starknetAddress: fromAddress(starknetContract),
  };
}

type LayerswapTokenBuilder = (
  externalToken: LsToken,
  starknetContract: string
) => BridgeToken;

/**
 * Load the address-normalization runtime for `chain` and return a builder for
 * discovered Layerswap tokens. Native assets are reported with a `null`
 * contract and mapped to the chain's native-token marker. Throws the
 * optional-peer-dependency error when the chain's runtime is not installed.
 */
async function loadLayerswapTokenBuilder(
  chain: ExternalChain
): Promise<LayerswapTokenBuilder> {
  if (chain === ExternalChain.ETHEREUM) {
    const ethers = await loadEthers("Layerswap token discovery");
    return (externalToken, starknetContract) =>
      new EthereumBridgeToken({
        ...layerswapTokenBase(chain, externalToken, starknetContract),
        protocol: Protocol.LAYERSWAP,
        address: fromEthereumAddress(
          externalToken.contract ?? NATIVE_TOKEN_ADDRESS[chain],
          ethers
        ),
        supportsAutoWithdraw: false,
      });
  }

  if (chain === ExternalChain.SOLANA) {
    const solanaWeb3 = await loadSolanaWeb3("Layerswap token discovery");
    return (externalToken, starknetContract) =>
      new SolanaBridgeToken({
        ...layerswapTokenBase(chain, externalToken, starknetContract),
        protocol: Protocol.LAYERSWAP,
        address: fromSolanaAddress(
          externalToken.contract ?? NATIVE_TOKEN_ADDRESS[chain],
          solanaWeb3
        ),
      });
  }

  throw new Error(`Layerswap discovery does not support chain "${chain}"`);
}

/** Canonical key for the external↔Starknet symbol join (case-insensitive). */
function symbolKey(symbol: string): string {
  return symbol.toUpperCase();
}

/**
 * Index route tokens by symbol, dropping symbols that appear more than once.
 * The external↔Starknet join is symbol-based, so an ambiguous symbol cannot be
 * safely mapped to a single contract — last-write-wins could silently pick the
 * wrong token (e.g. native USDC vs bridged USDC.e). Keyed case-insensitively so
 * casing drift between the two API sides neither drops valid pairs nor sneaks
 * past the ambiguity check; values keep their original symbol for display/id.
 */
function unambiguousBySymbol(
  tokens: readonly LsToken[],
  network: string,
  logger: StarkZapLogger
): Map<string, LsToken> {
  const bySymbol = new Map<string, LsToken>();
  const ambiguous = new Set<string>();
  for (const token of tokens) {
    const key = symbolKey(token.symbol);
    if (bySymbol.has(key)) {
      ambiguous.add(key);
    } else {
      bySymbol.set(key, token);
    }
  }
  for (const key of ambiguous) {
    const original = bySymbol.get(key)?.symbol ?? key;
    bySymbol.delete(key);
    logger.warn(
      `[starkzap] Skipping Layerswap token ${original}: multiple ${network} tokens share the symbol.`
    );
  }
  return bySymbol;
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
  private readonly logger: StarkZapLogger;
  private readonly layerswapApi: LayerswapTokenSource;
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

    this.fetchFn = resolveFetch(options.fetchFn);
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? NOOP_LOGGER;

    if (options.layerswapApi) {
      this.layerswapApi = options.layerswapApi;
    } else if (options.layerswapApiKey) {
      // The key is environment-scoped — Layerswap issues separate keys for
      // mainnet and testnet — so the discovery client must send it, otherwise
      // route discovery could return a different environment's networks than
      // the one swap creation targets.
      this.layerswapApi = new LayerswapApi({
        apiKey: options.layerswapApiKey,
        ...(options.layerswapBaseUrl
          ? { baseUrl: options.layerswapBaseUrl }
          : {}),
      });
    } else {
      throw new Error(
        'Bridge token discovery requires a Layerswap API key. Set "layerswapApiKey".'
      );
    }
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

    // Layerswap tokens are sourced exclusively from the Layerswap API, fully
    // independent of the StarkGate payload — so discovery runs concurrently
    // with the StarkGate fetch. The promise never rejects: each chain degrades
    // to an empty contribution on failure, flagged so the result is only
    // cached briefly.
    const discovered = this.discoverLayerswapTokens(
      this.layerswapApi,
      query.chain
        ? [query.chain]
        : [ExternalChain.ETHEREUM, ExternalChain.SOLANA],
      query.env ?? DEFAULT_ENV
    );

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
      return (
        !token.hidden &&
        !token.deprecated &&
        // Layerswap tokens are sourced exclusively from the Layerswap API;
        // any layerswap-protocol rows StarkGate serves are ignored.
        token.protocol?.toLowerCase() !== Protocol.LAYERSWAP
      );
    });
    const scopedPayload = query.chain
      ? visiblePayload.filter((token) => getTokenChain(token) === query.chain)
      : visiblePayload;

    const hasEthereumRows = scopedPayload.some(
      (token) => getTokenChain(token) === ExternalChain.ETHEREUM
    );
    const hasSolanaRows = scopedPayload.some(
      (token) => getTokenChain(token) === ExternalChain.SOLANA
    );
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
          this.logger.warn(
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
          this.logger.warn(
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
          this.logger.warn(`Ignoring token ${token.symbol} due to`, e);
          return null;
        }
      })
      .filter(isNonNull);

    const discovery = await discovered;
    tokens.push(...discovery.tokens);

    this.cache.set(key, {
      tokens,
      expiresAt:
        this.now() +
        (discovery.degraded
          ? Math.min(this.cacheTtlMs, LAYERSWAP_DEGRADED_CACHE_TTL_MS)
          : this.cacheTtlMs),
    });

    return tokens;
  }

  /**
   * Discover Layerswap-bridgeable tokens for the given chains, in parallel.
   * Self-contained: loads its own address-normalization runtimes, so it never
   * affects how the StarkGate payload is handled. Failures (network errors,
   * missing runtimes, missing routes, malformed tokens) degrade gracefully to
   * an empty contribution for that chain rather than failing the whole fetch;
   * `degraded` reports transient failures so callers can cache accordingly.
   */
  private async discoverLayerswapTokens(
    api: LayerswapTokenSource,
    chains: ExternalChain[],
    env: BridgeTokenApiEnv
  ): Promise<LayerswapDiscoveryResult> {
    const perChain = await Promise.all(
      chains.map((chain) => this.discoverLayerswapChain(api, chain, env))
    );
    return {
      tokens: perChain.flatMap((result) => result.tokens),
      degraded: perChain.some((result) => result.degraded),
    };
  }

  private async discoverLayerswapChain(
    api: LayerswapTokenSource,
    chain: ExternalChain,
    env: BridgeTokenApiEnv
  ): Promise<LayerswapDiscoveryResult> {
    try {
      const buildToken = await loadLayerswapTokenBuilder(chain);
      const route = resolveLayerswapRoute(chain, env);
      const [sources, destinations] = await Promise.all([
        api.getSources({
          destinationNetwork: route.starknetNetwork,
          networkTypes: [route.networkType],
        }),
        api.getDestinations({ sourceNetwork: route.externalNetwork }),
      ]);

      const externalRoute = sources.find(
        (entry) => entry.name === route.externalNetwork
      );
      const starknetRoute = destinations.find(
        (entry) => entry.name === route.starknetNetwork
      );
      if (!externalRoute || !starknetRoute) {
        return { tokens: [], degraded: false };
      }

      const externalBySymbol = unambiguousBySymbol(
        externalRoute.tokens,
        externalRoute.name,
        this.logger
      );
      const starknetBySymbol = unambiguousBySymbol(
        starknetRoute.tokens,
        starknetRoute.name,
        this.logger
      );

      const tokens: BridgeToken[] = [];
      for (const externalToken of externalBySymbol.values()) {
        const starknetToken = starknetBySymbol.get(
          symbolKey(externalToken.symbol)
        );
        if (!starknetToken?.contract) {
          // No matching Starknet-side token, so no L2 address to bridge to.
          continue;
        }
        if (starknetToken.decimals !== externalToken.decimals) {
          // BridgeToken carries a single decimals value for both sides, so a
          // mismatched pair would mis-scale Starknet amounts by 10^diff.
          this.logger.warn(
            `[starkzap] Skipping Layerswap token ${externalToken.symbol}: decimals differ between ${externalRoute.name} (${externalToken.decimals}) and ${starknetRoute.name} (${starknetToken.decimals}).`
          );
          continue;
        }
        try {
          tokens.push(buildToken(externalToken, starknetToken.contract));
        } catch (error) {
          this.logger.warn(
            `Ignoring Layerswap token ${externalToken.symbol} due to`,
            error
          );
        }
      }
      return { tokens, degraded: false };
    } catch (error) {
      this.logger.warn(
        `[starkzap] Skipping Layerswap ${chain} token discovery due to`,
        error
      );
      // A missing optional runtime is a permanent condition — retrying soon
      // cannot help — whereas anything else (network error, timeout, bad
      // payload) is treated as transient and worth a short-TTL retry.
      const permanent =
        isOptionalPeerDependencyError(error, "ethers") ||
        isOptionalPeerDependencyError(error, "@solana/web3.js");
      return { tokens: [], degraded: !permanent };
    }
  }
}
