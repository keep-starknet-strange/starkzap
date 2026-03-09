import { fromAddress, type ChainId } from "@/types";
import type { VesuConfig, RewardCampaign, RewardCampaignInfo } from "@/lending/types";

/**
 * Vesu lending protocol configuration presets per chain.
 *
 * Contains contract addresses for the reward distributors and
 * other Vesu protocol contracts.
 *
 * Source: https://docs.vesu.xyz/developers/contract-addresses
 */
export const vesuPresets = {
  SN_MAIN: {
    defiSpringDistributor: fromAddress(
      "0x0387f3eb1d98632fbe3440a9f1385aec9d87b6172491d3dd81f1c35a7c61048f"
    ),
    btcfiDistributor: fromAddress(
      "0x047ba31cdfc2db9bd20ab8a5b2788f877964482a8548a6e366ce56228ea22fa8"
    ),
  },
  SN_SEPOLIA: {
    // Testnet has no reward programs
    defiSpringDistributor: fromAddress(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    ),
    btcfiDistributor: fromAddress(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    ),
  },
} as const satisfies Record<string, VesuConfig>;

/**
 * Get Vesu preset configuration for a chain.
 */
export function getVesuPreset(chainId: ChainId): VesuConfig {
  const literal = chainId.toLiteral();
  if (literal === "SN_MAIN") {
    return vesuPresets.SN_MAIN;
  }
  if (literal === "SN_SEPOLIA") {
    return vesuPresets.SN_SEPOLIA;
  }
  throw new Error(`Unsupported chain for Vesu config: ${literal}`);
}

/**
 * Campaign information with current status.
 */
export const campaignInfo: Record<RewardCampaign, RewardCampaignInfo> = {
  defi_spring: {
    campaign: "defi_spring",
    name: "DeFi Spring",
    status: "claim_only",
    description:
      "Starknet Foundation incentive program distributing STRK rewards for DeFi participation on Vesu. " +
      "Rewards were earned for supplying STRK, xSTRK, wstETH, ETH, USDC, and USDT.",
    claimDeadline: new Date("2026-03-31"),
  },
  btcfi_season: {
    campaign: "btcfi_season",
    name: "BTCFi Season",
    status: "active",
    description:
      "100M STRK allocated to bootstrap the BTCFi ecosystem. " +
      "Rewards active BTC usage, especially borrowing stablecoins against BTC collateral.",
  },
};
