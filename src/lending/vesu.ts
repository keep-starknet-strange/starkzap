import { type Call, Contract, type RpcProvider } from "starknet";
import { type Address, Amount, type Token, fromAddress } from "@/types";
import { DISTRIBUTOR_ABI } from "@/abi/distributor";
import {
  type RewardCampaign,
  type RewardInfo,
  type WalletRewards,
  type GetRewardsOptions,
  type ClaimRewardsResult,
  type VesuConfig,
  type RewardCampaignInfo,
} from "./types";
import { getVesuPreset, campaignInfo } from "./presets";
import type { WalletInterface } from "@/wallet";
import type { Tx } from "@/tx";
import type { ChainId } from "@/types";
import { getTokensFromAddresses } from "@/erc20/token";

/**
 * STRK token address on Starknet mainnet.
 */
const STRK_ADDRESS = fromAddress(
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
);

/**
 * Vesu Rewards provides read and claim functionality for Starknet Foundation
 * reward programs distributed through Vesu lending protocol.
 *
 * Supported campaigns:
 * - **DeFi Spring** (ended): Users can claim unclaimed rewards until March 31, 2026
 * - **BTCFi Season** (active): Rewards for borrowing stablecoins against BTC collateral
 *
 * @example
 * ```ts
 * // Get rewards for a wallet
 * const rewards = await VesuRewards.fromChain(chainId, provider);
 * const walletRewards = await rewards.getRewards(wallet.address);
 *
 * console.log(`Total claimable: ${walletRewards.totalClaimable.toFormatted()}`);
 *
 * // Claim rewards
 * if (!walletRewards.totalClaimable.isZero()) {
 *   const { result } = await rewards.claimRewards(wallet);
 *   console.log(`Claimed ${result.amount.toFormatted()} STRK`);
 * }
 * ```
 */
export class VesuRewards {
  private readonly config: VesuConfig;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private strkToken: Token | null = null;

  private constructor(
    config: VesuConfig,
    provider: RpcProvider,
    chainId: ChainId
  ) {
    this.config = config;
    this.provider = provider;
    this.chainId = chainId;
  }

  /**
   * Create a VesuRewards instance with default configuration for a chain.
   */
  static async fromChain(
    chainId: ChainId,
    provider: RpcProvider
  ): Promise<VesuRewards> {
    const preset = getVesuPreset(chainId);
    return new VesuRewards(preset, provider, chainId);
  }

  /**
   * Create a VesuRewards instance with custom configuration.
   */
  static withConfig(
    config: VesuConfig,
    provider: RpcProvider,
    chainId: ChainId
  ): VesuRewards {
    return new VesuRewards(config, provider, chainId);
  }

  /**
   * Get the STRK token instance.
   */
  private async getStrkToken(): Promise<Token> {
    if (this.strkToken) {
      return this.strkToken;
    }

    const tokens = await getTokensFromAddresses([STRK_ADDRESS], this.provider);
    if (!tokens[0]) {
      throw new Error("Failed to load STRK token metadata");
    }
    this.strkToken = tokens[0];
    return tokens[0];
  }

  /**
   * Get campaign info.
   */
  getCampaignInfo(campaign: RewardCampaign): RewardCampaignInfo {
    return campaignInfo[campaign];
  }

  /**
   * Get all supported campaigns.
   */
  getSupportedCampaigns(): RewardCampaign[] {
    return ["defi_spring", "btcfi_season"];
  }

  /**
   * Get the distributor address for a campaign.
   */
  private getDistributorAddress(campaign: RewardCampaign): Address {
    switch (campaign) {
      case "defi_spring":
        return this.config.defiSpringDistributor;
      case "btcfi_season":
        return this.config.btcfiDistributor;
      default:
        throw new Error(`Unknown campaign: ${campaign}`);
    }
  }

  /**
   * Get reward information for a specific campaign.
   *
   * @param user - User wallet address
   * @param campaign - Campaign to query
   * @returns Reward information for the campaign
   */
  async getRewardInfo(user: Address, campaign: RewardCampaign): Promise<RewardInfo> {
    const distributorAddress = this.getDistributorAddress(campaign);
    const strkToken = await this.getStrkToken();

    // Check if distributor has a valid address
    if (distributorAddress === "0x0" || distributorAddress === "") {
      // Return zero rewards for testnet or unsupported chains
      return {
        campaign,
        claimable: Amount.fromRaw(0n, strkToken),
        claimed: Amount.fromRaw(0n, strkToken),
        totalEarned: Amount.fromRaw(0n, strkToken),
        token: strkToken,
        canClaim: false,
      };
    }

    try {
      const distributor = new Contract({
        abi: DISTRIBUTOR_ABI,
        address: distributorAddress,
        providerOrAccount: this.provider,
      });

      // Fetch claimable and claimed amounts
      const [claimableResult, claimedResult] = await Promise.all([
        distributor.call("get_claimable", [user]),
        distributor.call("get_claimed", [user]),
      ]);

      const claimableRaw = this.extractUint256(claimableResult);
      const claimedRaw = this.extractUint256(claimedResult);

      const claimable = Amount.fromRaw(claimableRaw, strkToken);
      const claimed = Amount.fromRaw(claimedRaw, strkToken);

      return {
        campaign,
        claimable,
        claimed,
        totalEarned: claimable.add(claimed),
        token: strkToken,
        canClaim: !claimable.isZero(),
      };
    } catch {
      // Return zero rewards on error
      return {
        campaign,
        claimable: Amount.fromRaw(0n, strkToken),
        claimed: Amount.fromRaw(0n, strkToken),
        totalEarned: Amount.fromRaw(0n, strkToken),
        token: strkToken,
        canClaim: false,
      };
    }
  }

  /**
   * Get all rewards for a wallet across all campaigns.
   *
   * @param user - User wallet address
   * @param options - Optional filters for specific campaigns
   * @returns Aggregated reward information
   */
  async getRewards(user: Address, options: GetRewardsOptions = {}): Promise<WalletRewards> {
    const { campaigns = this.getSupportedCampaigns(), signal } = options;
    const strkToken = await this.getStrkToken();

    // Fetch rewards for each campaign
    const campaignsMap = new Map<RewardCampaign, RewardInfo>();
    let totalClaimable = Amount.fromRaw(0n, strkToken);
    let totalClaimed = Amount.fromRaw(0n, strkToken);

    for (const campaign of campaigns) {
      if (signal?.aborted) {
        throw new Error("Request aborted");
      }

      const info = await this.getRewardInfo(user, campaign);
      campaignsMap.set(campaign, info);
      totalClaimable = totalClaimable.add(info.claimable);
      totalClaimed = totalClaimed.add(info.claimed);
    }

    return {
      address: user,
      campaigns: campaignsMap,
      totalClaimable,
      totalClaimed,
      token: strkToken,
    };
  }

  /**
   * Build claim calls for rewards from specified campaigns.
   *
   * @param user - User wallet address
   * @param campaigns - Campaigns to claim from (defaults to all with claimable rewards)
   * @returns Array of calls to execute
   */
  async buildClaimCalls(
    user: Address,
    campaigns?: RewardCampaign[]
  ): Promise<{ calls: Call[]; campaigns: RewardCampaign[] }> {
    const targetCampaigns = campaigns ?? this.getSupportedCampaigns();
    const calls: Call[] = [];
    const claimedCampaigns: RewardCampaign[] = [];

    for (const campaign of targetCampaigns) {
      const distributorAddress = this.getDistributorAddress(campaign);

      // Skip if no valid distributor
      if (distributorAddress === "0x0" || distributorAddress === "") {
        continue;
      }

      // Check if there are claimable rewards
      const info = await this.getRewardInfo(user, campaign);
      if (!info.canClaim) {
        continue;
      }

      // Build the claim call
      const claimCall: Call = {
        contractAddress: distributorAddress,
        entrypoint: "claim",
        calldata: [user],
      };
      calls.push(claimCall);
      claimedCampaigns.push(campaign);
    }

    return { calls, campaigns: claimedCampaigns };
  }

  /**
   * Claim rewards from specified campaigns.
   *
   * @param wallet - Wallet to claim rewards for
   * @param options - Claim options (specific campaigns, throw on empty)
   * @returns Transaction object and claim details
   */
  async claimRewards(
    wallet: WalletInterface,
    options: { campaigns?: RewardCampaign[]; throwOnEmpty?: boolean } = {}
  ): Promise<{ tx: Tx; result: ClaimRewardsResult }> {
    const { campaigns, throwOnEmpty = false } = options;

    // Build claim calls
    const { calls, campaigns: claimedCampaigns } = await this.buildClaimCalls(
      wallet.address,
      campaigns
    );

    if (calls.length === 0) {
      if (throwOnEmpty) {
        throw new Error("No rewards available to claim");
      }

      // Return empty result
      const strkToken = await this.getStrkToken();
      return {
        tx: await wallet.execute([]),
        result: {
          amount: Amount.fromRaw(0n, strkToken),
          token: strkToken,
          txHash: "",
          campaigns: [],
        },
      };
    }

    // Execute the claims
    const tx = await wallet.execute(calls);

    // Calculate total claimed
    const strkToken = await this.getStrkToken();
    let totalClaimed = Amount.fromRaw(0n, strkToken);
    for (const campaign of claimedCampaigns) {
      const info = await this.getRewardInfo(wallet.address, campaign);
      totalClaimed = totalClaimed.add(info.claimable);
    }

    return {
      tx,
      result: {
        amount: totalClaimed,
        token: strkToken,
        txHash: tx.hash,
        campaigns: claimedCampaigns,
      },
    };
  }

  /**
   * Extract Uint256 value from contract response.
   */
  private extractUint256(result: unknown): bigint {
    if (typeof result === "bigint") {
      return result;
    }
    if (typeof result === "object" && result !== null) {
      const obj = result as Record<string, unknown>;
      // Handle { low, high } format
      if ("low" in obj && "high" in obj) {
        const low = BigInt(obj.low as string | number | bigint);
        const high = BigInt(obj.high as string | number | bigint);
        return (high << 128n) + low;
      }
      // Handle array format [low, high]
      if (Array.isArray(result)) {
        const [low, high] = result;
        return (
          (BigInt(high as string | number | bigint) << 128n) +
          BigInt(low as string | number | bigint)
        );
      }
    }
    return 0n;
  }
}
