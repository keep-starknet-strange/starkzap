import { fromAddress, type Address } from "@/types";

export interface VesuChainConfig {
  poolFactory?: Address;
  defaultPool?: Address;
  marketsApiUrl?: string;
}

/**
 * Chain-aware Vesu defaults.
 *
 * Mainnet addresses source:
 * https://docs.vesu.xyz/developers/addresses
 */
export const vesuPresets = {
  SN_MAIN: {
    poolFactory: fromAddress(
      "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0"
    ),
    defaultPool: fromAddress(
      "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5"
    ),
    marketsApiUrl: "https://api.vesu.xyz/markets",
  },
  // Testnet pool shared by Vesu team for integration testing.
  // Pool name on-chain: "WBTC Prime Sepolia"
  SN_SEPOLIA: {
    poolFactory: fromAddress(
      "0x03ac869e64b1164aaee7f3fd251f86581eab8bfbbd2abdf1e49c773282d4a092"
    ),
    defaultPool: fromAddress(
      "0x06227c13372b8c7b7f38ad1cfe05b5cf515b4e5c596dd05fe8437ab9747b2093"
    ),
  },
} as const satisfies Record<"SN_MAIN" | "SN_SEPOLIA", VesuChainConfig>;
