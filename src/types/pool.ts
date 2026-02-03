import { Amount } from "@/types/amount";
import type { Address } from "@/types/address";

/**
 * Pool member position information
 */
export interface PoolMember {
  /** Staked amount (active in pool) */
  staked: Amount;
  /** Unclaimed rewards available to claim */
  rewards: Amount;
  /** Total position value (staked + rewards) */
  total: Amount;
  /** Amount currently in exit process */
  unpooling: Amount;
  /** Timestamp when exit can be completed (if unpooling) */
  unpoolTime: Date | null;
  /** Commission rate as percentage (e.g., 10 = 10%) */
  commissionPercent: number;
  /** The reward address for this pool member */
  rewardAddress: Address;
}
