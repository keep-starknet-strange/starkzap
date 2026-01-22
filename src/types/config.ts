import type { SponsorshipRequest, SponsorshipResponse } from "./sponsorship.js";

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
 * Configuration for gasless (sponsored) transactions.
 *
 * You provide a callback that the SDK calls whenever it needs
 * sponsorship. This callback typically makes a request to your backend.
 *
 * @example
 * ```ts
 * {
 *   getSponsorship: async (req) => {
 *     const res = await fetch("https://api.yourapp.com/sponsor", {
 *       method: "POST",
 *       body: JSON.stringify(req),
 *     });
 *     if (!res.ok) throw new Error("Sponsorship rejected");
 *     return res.json();
 *   }
 * }
 * ```
 */
export interface SponsorConfig {
  /**
   * Called when the SDK needs fee sponsorship for a transaction.
   * Should return sponsorship details or throw to reject.
   */
  getSponsorship: (request: SponsorshipRequest) => Promise<SponsorshipResponse>;
}

/**
 * Main configuration for the StarkSDK.
 *
 * @example
 * ```ts
 * const sdk = new StarkSDK({
 *   rpcUrl: "https://starknet-mainnet.infura.io/v3/YOUR_KEY",
 *   chainId: "SN_MAIN",
 *   sponsor: { getSponsorship: async (req) => { ... } },
 *   explorer: { provider: "voyager" }
 * });
 * ```
 */
export interface SDKConfig {
  /** Starknet JSON-RPC endpoint URL */
  rpcUrl: string;
  /** Target chain (mainnet or testnet) */
  chainId: ChainId;
  /** Optional: required if using feeMode="sponsored" */
  sponsor?: SponsorConfig;
  /** Optional: configures how explorer URLs are built */
  explorer?: ExplorerConfig;
}
