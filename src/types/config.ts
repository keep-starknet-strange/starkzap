import {
  type PaymasterOptions,
  RpcProvider,
  CairoFelt252,
  constants,
} from "starknet";
import type { NetworkPreset, NetworkName } from "@/network";
import type { Address } from "@/types";

/** Supported Starknet chain identifiers */
export type ChainIdLiteral = "SN_MAIN" | "SN_SEPOLIA";

const VALID_CHAIN_IDS: readonly string[] = ["SN_MAIN", "SN_SEPOLIA"];

/**
 * Represents a Starknet chain identifier.
 *
 * Provides helpers for chain detection and conversion between
 * literal strings and felt252 on-chain representations.
 *
 * @example
 * ```ts
 * // Use static constants (recommended)
 * const chain = ChainId.MAINNET;
 * const chain = ChainId.SEPOLIA;
 *
 * // Create from a literal
 * const chain = ChainId.from("SN_MAIN");
 *
 * // Create from an on-chain felt252 value
 * const chain = ChainId.fromFelt252(chainIdHex);
 *
 * // Check which chain
 * if (chain.isMainnet()) { ... }
 * if (chain.isSepolia()) { ... }
 * ```
 */
export class ChainId {
  constructor(readonly value: ChainIdLiteral) {}

  /** Returns `true` if this is Starknet Mainnet (`SN_MAIN`). */
  isMainnet(): boolean {
    return this.value === "SN_MAIN";
  }

  /** Returns `true` if this is Starknet Sepolia testnet (`SN_SEPOLIA`). */
  isSepolia(): boolean {
    return this.value === "SN_SEPOLIA";
  }

  /**
   * Returns the felt252 (hex) representation used on-chain.
   * @throws Error if the chain ID is not recognized
   */
  toFelt252(): string {
    if (this.isMainnet()) return constants.StarknetChainId.SN_MAIN;
    if (this.isSepolia()) return constants.StarknetChainId.SN_SEPOLIA;
    throw new Error(`Unknown chain ID: ${this.value}`);
  }

  /** Returns the literal string value (e.g. `"SN_MAIN"` or `"SN_SEPOLIA"`). */
  toLiteral(): ChainIdLiteral {
    return this.value;
  }

  /** Pre-built instance for Starknet Mainnet. */
  static readonly MAINNET = new ChainId("SN_MAIN");

  /** Pre-built instance for Starknet Sepolia testnet. */
  static readonly SEPOLIA = new ChainId("SN_SEPOLIA");

  /**
   * Create a ChainId from a literal string.
   * @param literal - `"SN_MAIN"` or `"SN_SEPOLIA"`
   */
  static from(literal: ChainIdLiteral): ChainId {
    return new ChainId(literal);
  }

  /**
   * Create a ChainId from an on-chain felt252 hex value.
   * @param felt252 - The hex-encoded chain ID (e.g. from `provider.getChainId()`)
   * @throws Error if the decoded value is not a supported chain
   */
  static fromFelt252(felt252: string): ChainId {
    const decoded = new CairoFelt252(felt252).decodeUtf8();
    if (!VALID_CHAIN_IDS.includes(decoded)) {
      throw new Error(
        `Unsupported chain ID: "${decoded}". Expected one of: ${VALID_CHAIN_IDS.join(", ")}`
      );
    }
    return new ChainId(decoded as ChainIdLiteral);
  }
}

/**
 * Detect the chain ID from an RPC provider.
 * @param provider - The RPC provider to query
 * @returns The detected ChainId
 * @throws Error if the provider returns an unsupported chain
 */
export async function getChainId(provider: RpcProvider): Promise<ChainId> {
  const chainIdHex = await provider.getChainId();
  return ChainId.fromFelt252(chainIdHex);
}

/** Supported block explorer providers */
export type ExplorerProvider = "voyager" | "starkscan";

/**
 * Configuration for building explorer URLs.
 *
 * @example
 * ```ts
 * // Use a known provider
 * { provider: "voyager" }
 *
 * // Use a custom explorer
 * { baseUrl: "https://my-explorer.com" }
 * ```
 */
export interface ExplorerConfig {
  /** Use a known explorer provider */
  provider?: ExplorerProvider;
  /** Or provide a custom base URL (takes precedence over provider) */
  baseUrl?: string;
}

/**
 * Configuration for the Staking module.
 *
 * Optional override for the core staking contract.
 *
 * If omitted, the SDK uses the built-in chain-aware preset
 * for the configured `chainId`.
 *
 * @example
 * ```ts
 * const sdk = new StarkZap({
 *   rpcUrl: "https://starknet-mainnet.infura.io/v3/YOUR_KEY",
 *   chainId: ChainId.MAINNET,
 *   staking: {
 *     contract: "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
 *   },
 * });
 * ```
 */
export interface StakingConfig {
  /** Address of the core staking contract (override default preset) */
  contract: Address;
}

/**
 * Main configuration for the StarkZap.
 *
 * You can configure using a network preset or custom rpcUrl/chainId.
 *
 * @example
 * ```ts
 * // Using a network preset (recommended)
 * const sdk = new StarkZap({ network: "mainnet" });
 * const sdk = new StarkZap({ network: "sepolia" });
 *
 * // Using a preset object directly
 * import { networks } from "starkzap";
 * const sdk = new StarkZap({ network: networks.mainnet });
 *
 * // Custom configuration
 * const sdk = new StarkZap({
 *   rpcUrl: "https://my-rpc.example.com",
 *   chainId: ChainId.MAINNET,
 * });
 *
 * // With custom paymaster endpoint
 * const sdk = new StarkZap({
 *   network: "sepolia",
 *   paymaster: { nodeUrl: "https://custom-paymaster.example.com" },
 * });
 * ```
 */
export interface SDKConfig {
  /** Use a network preset (e.g., "mainnet", "sepolia", or a NetworkPreset object) */
  network?: NetworkName | NetworkPreset;
  /** Starknet JSON-RPC endpoint URL (overrides network preset) */
  rpcUrl?: string;
  /** Target chain (overrides network preset) */
  chainId?: ChainId;
  /** Optional: custom paymaster config (default: AVNU paymaster) */
  paymaster?: PaymasterOptions;
  /** Optional: configures how explorer URLs are built */
  explorer?: ExplorerConfig;

  /**
   * Optional: configuration for the Staking module (override default preset).
   *
   * Staking functionality includes:
   * - Entering and exiting delegation pools
   * - Adding to existing stakes and claiming rewards
   * - Querying validator pools and active staking tokens
   *
   * @see {@link StakingConfig}
   */
  staking?: StakingConfig;
}
