import type { PaymasterOptions } from "starknet";
import type { NetworkPreset, NetworkName } from "@/network";

/** Supported Starknet chain identifiers */
export type ChainId = "SN_MAIN" | "SN_SEPOLIA";

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
}
