import type { Address, Amount, Token } from "@/types";

/**
 * Reward campaign types supported by Vesu.
 */
export type RewardCampaign = "defi_spring" | "btcfi_season";

/**
 * Status of a reward campaign.
 */
export type CampaignStatus = "active" | "ended" | "claim_only";

/**
 * Information about a reward campaign.
 */
export interface RewardCampaignInfo {
  /** Campaign identifier */
  campaign: RewardCampaign;
  /** Campaign status */
  status: CampaignStatus;
  /** Human-readable campaign name */
  name: string;
  /** Campaign description */
  description?: string;
  /** End date if campaign has ended */
  endDate?: Date;
  /** Claim deadline (after this, unclaimed rewards may be lost) */
  claimDeadline?: Date;
}

/**
 * Reward information for a wallet in a specific campaign.
 */
export interface RewardInfo {
  /** The campaign this reward belongs to */
  campaign: RewardCampaign;
  /** Total claimable amount */
  claimable: Amount;
  /** Total claimed amount */
  claimed: Amount;
  /** Total earned amount (claimable + claimed) */
  totalEarned: Amount;
  /** Token the reward is paid in (typically STRK) */
  token: Token;
  /** Whether rewards are available to claim */
  canClaim: boolean;
  /** Optional: next distribution date */
  nextDistribution?: Date;
}

/**
 * Aggregated reward information across all campaigns.
 */
export interface WalletRewards {
  /** User's wallet address */
  address: Address;
  /** Rewards by campaign */
  campaigns: Map<RewardCampaign, RewardInfo>;
  /** Total claimable across all campaigns */
  totalClaimable: Amount;
  /** Total claimed across all campaigns */
  totalClaimed: Amount;
  /** Reward token (typically STRK) */
  token: Token;
}

/**
 * Options for claiming rewards.
 */
export interface ClaimRewardsOptions {
  /** Specific campaigns to claim from. If not provided, claims from all. */
  campaigns?: RewardCampaign[];
  /** Whether to throw if no rewards are available */
  throwOnEmpty?: boolean;
}

/**
 * Result of a reward claim operation.
 */
export interface ClaimRewardsResult {
  /** Total amount claimed */
  amount: Amount;
  /** Token claimed */
  token: Token;
  /** Transaction hash */
  txHash: string;
  /** Campaigns claimed from */
  campaigns: RewardCampaign[];
}

/**
 * Vesu lending configuration.
 */
export interface VesuConfig {
  /** DeFi Spring Distributor contract address */
  defiSpringDistributor: Address;
  /** BTCFi Distributor contract address */
  btcfiDistributor: Address;
}

/**
 * Options for fetching rewards.
 */
export interface GetRewardsOptions {
  /** Specific campaigns to fetch. If not provided, fetches all. */
  campaigns?: RewardCampaign[];
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}
