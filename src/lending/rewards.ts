import type { Call } from "starknet";
import type { Address, ChainId, Token } from "@/types";
import type { LendingProviderContext } from "./interface";

/**
 * Reward campaign types supported by lending protocols.
 */
export type RewardCampaign = "btcfi_season" | "defi_spring" | "custom";

/**
 * Reward distribution status.
 */
export type RewardStatus = "active" | "ended" | "upcoming";

/**
 * Information about a reward campaign.
 */
export interface RewardCampaignInfo {
  /** Campaign identifier */
  id: string;
  /** Campaign type */
  type: RewardCampaign;
  /** Human-readable name */
  name: string;
  /** Campaign description */
  description?: string;
  /** Start timestamp (Unix seconds) */
  startTs: number;
  /** End timestamp (Unix seconds) */
  endTs: number;
  /** Current status */
  status: RewardStatus;
  /** Reward token */
  rewardToken: Token;
  /** Associated pool/market address */
  poolAddress?: Address;
  /** Associated vToken address */
  vTokenAddress?: Address;
}

/**
 * Claimable reward for a user.
 */
export interface ClaimableReward {
  /** Campaign the reward is from */
  campaign: RewardCampaignInfo;
  /** Amount in base units */
  amount: bigint;
  /** Formatted amount for display */
  formattedAmount: string;
  /** Reward token */
  token: Token;
  /** Whether the claim window is open */
  canClaim: boolean;
  /** Claim deadline if applicable */
  claimDeadline?: number;
}

/**
 * User's total rewards summary.
 */
export interface RewardsSummary {
  /** Total claimable across all campaigns */
  totalClaimable: bigint;
  /** Breakdown by campaign */
  byCampaign: Map<string, ClaimableReward>;
  /** All campaigns user has rewards from */
  campaigns: RewardCampaignInfo[];
}

/**
 * Request to get user's claimable rewards.
 */
export interface RewardsRequest {
  /** User address */
  user: Address;
  /** Filter by campaign type */
  campaignType?: RewardCampaign;
  /** Filter by pool address */
  poolAddress?: Address;
}

/**
 * Request to claim rewards.
 */
export interface ClaimRewardsRequest {
  /** User address (must match wallet) */
  user: Address;
  /** Campaign to claim from (all if not specified) */
  campaignId?: string;
  /** Specific pool to claim from */
  poolAddress?: Address;
  /** Receiver address for rewards (defaults to user) */
  receiver?: Address;
}

/**
 * Prepared claim action.
 */
export interface PreparedClaimAction {
  providerId: string;
  action: "claim_rewards";
  calls: Call[];
  campaigns: RewardCampaignInfo[];
  estimatedReward: bigint;
}

/**
 * Rewards provider interface.
 * Each lending protocol can implement this to expose reward claiming.
 */
export interface RewardsProvider {
  /** Provider identifier */
  readonly id: string;

  /** Check if chain is supported */
  supportsChain(chainId: ChainId): boolean;

  /** Get active campaigns */
  getCampaigns(chainId: ChainId): Promise<RewardCampaignInfo[]>;

  /** Get user's claimable rewards */
  getClaimableRewards(
    context: LendingProviderContext,
    request: RewardsRequest
  ): Promise<ClaimableReward[]>;

  /** Prepare claim transaction */
  prepareClaim(
    context: LendingProviderContext,
    request: ClaimRewardsRequest
  ): Promise<PreparedClaimAction>;

  /** Optional: Get rewards history for a user */
  getRewardsHistory?(
    context: LendingProviderContext,
    request: RewardsRequest
  ): Promise<ClaimableReward[]>;
}

/**
 * Helper to check if a campaign is active.
 */
export function isCampaignActive(campaign: RewardCampaignInfo): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= campaign.startTs && now <= campaign.endTs;
}

/**
 * Helper to check if a campaign has ended.
 */
export function isCampaignEnded(campaign: RewardCampaignInfo): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now > campaign.endTs;
}

/**
 * Helper to format reward amount.
 */
export function formatRewardAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${fractionStr}`;
}
