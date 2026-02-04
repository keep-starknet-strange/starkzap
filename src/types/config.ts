import { type PaymasterOptions, RpcProvider, CairoFelt252 } from "starknet";
import type { NetworkPreset, NetworkName } from "@/network";
import type { Address } from "@/types";

/** Supported Starknet chain identifiers */
export type ChainId = "SN_MAIN" | "SN_SEPOLIA";

export async function getChainId(provider: RpcProvider): Promise<ChainId> {
  const chainIdHex = await provider.getChainId();
  return new CairoFelt252(chainIdHex).decodeUtf8() as ChainId;
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
 * Required for using staking functionality such as entering/exiting pools,
 * querying validator pools, and retrieving active staking tokens.
 *
 * @example
 * ```ts
 * const sdk = new StarkSDK({
 *   rpcUrl: "https://starknet-mainnet.infura.io/v3/YOUR_KEY",
 *   chainId: "SN_MAIN",
 *   staking: {
 *     contract: "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1",
 *     mintingCurveContract: "0x06043928ca93cff6d6f39378ba391d7152eea707bdd624c1b2074e71af2abaca",
 *   },
 * });
 * ```
 */
export interface StakingConfig {
  /** Address of the core staking contract */
  contract: Address;
  /** Address of the minting curve contract used for reward calculations */
  mintingCurveContract: Address;
}

/**
 * Main configuration for the StarkSDK.
 *
 * You can configure using a network preset or custom rpcUrl/chainId.
 *
 * @example
 * ```ts
 * // Using a network preset (recommended)
 * const sdk = new StarkSDK({ network: "mainnet" });
 * const sdk = new StarkSDK({ network: "sepolia" });
 *
 * // Using a preset object directly
 * import { networks } from "x";
 * const sdk = new StarkSDK({ network: networks.mainnet });
 *
 * // Custom configuration
 * const sdk = new StarkSDK({
 *   rpcUrl: "https://my-rpc.example.com",
 *   chainId: "SN_MAIN",
 * });
 *
 * // With custom paymaster endpoint
 * const sdk = new StarkSDK({
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
   * Optional: configuration for the Staking module.
   *
   * Required for staking functionality including:
   * - Entering and exiting delegation pools
   * - Adding to existing stakes and claiming rewards
   * - Querying validator pools and active staking tokens
   *
   * @see {@link StakingConfig}
   */
  staking?: StakingConfig;
}
