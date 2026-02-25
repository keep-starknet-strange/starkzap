import { fromAddress, type Address, type ChainId } from "@/types";

/**
 * Ekubo extension router configuration.
 */
export interface EkuboSwapConfig {
  /** Ekubo router contract used as swap target */
  extensionRouter: Address;
}

/**
 * Chain-aware Ekubo presets.
 *
 * Source: https://docs.ekubo.org/integration-guides/reference/smart-contracts/starknet-contracts
 */
export const ekuboPresets = {
  SN_MAIN: {
    extensionRouter: fromAddress(
      "0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e"
    ),
  },
  SN_SEPOLIA: {
    extensionRouter: fromAddress(
      "0x0045f933adf0607292468ad1c1dedaa74d5ad166392590e72676a34d01d7b763"
    ),
  },
} as const satisfies Record<"SN_MAIN" | "SN_SEPOLIA", EkuboSwapConfig>;

/**
 * Get Ekubo preset configuration for the target chain.
 */
export function getEkuboPreset(chainId: ChainId): EkuboSwapConfig {
  return ekuboPresets[chainId.toLiteral()];
}
