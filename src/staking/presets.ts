import { fromAddress, type ChainId, type StakingConfig } from "@/types";

/**
 * Core staking contract presets per supported chain.
 *
 * These defaults are used by `StarkZap` when `staking.contract`
 * is not explicitly provided in the SDK config.
 */
export const stakingPresets = {
  SN_MAIN: {
    contract: fromAddress(
      "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7"
    ),
  },
  SN_SEPOLIA: {
    contract: fromAddress(
      "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
    ),
  },
} as const satisfies Record<"SN_MAIN" | "SN_SEPOLIA", StakingConfig>;

/**
 * Returns the default staking config for a given chain.
 */
export function getStakingPreset(chainId: ChainId): StakingConfig {
  return stakingPresets[chainId.toLiteral()];
}
