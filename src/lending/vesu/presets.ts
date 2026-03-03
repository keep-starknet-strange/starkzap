import { fromAddress, type Address } from "@/types";

export interface VesuChainConfig {
  poolFactory: Address;
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
} as const satisfies Record<"SN_MAIN", VesuChainConfig>;
