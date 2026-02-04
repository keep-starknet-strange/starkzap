import { Amount } from "@/types/amount";
import type { Address } from "@/types/address";
import type { Token } from "@/types/token";

/**
 * Represents a staking pool for a validator.
 *
 * Each validator can have multiple pools, one per supported token (e.g., STRK, BTC).
 */
export interface Pool {
  /** The pool contract address */
  poolContract: Address;
  /** The token that can be staked in this pool */
  token: Token;
  /** The total amount staked in this pool by the validator */
  amount: Amount;
}

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
