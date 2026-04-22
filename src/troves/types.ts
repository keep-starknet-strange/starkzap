import type { Address } from "@/types/address";
import type { Amount } from "@/types/amount";

export interface TrovesDepositToken {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  logo?: string;
}

/** A contract address (with a human-readable role) associated with a strategy. */
export interface TrovesContract {
  name: string;
  address: Address;
}

export interface TrovesStrategyAPIResult {
  name: string;
  id: string;
  /**
   * APY for the strategy.
   *
   * Most strategies return a number (e.g. `0.0537` = 5.37%). A few non-yield
   * strategies (e.g. accumulator vaults) return a marketing label like
   * `"🤙YOLO"`. When this field is a string, fall back to
   * `apySplit.baseApy + apySplit.rewardsApy` for the numeric value.
   *
   * Numeric strings from the API (e.g. `"0.05"`) are normalized to numbers.
   */
  apy: number | string;
  apySplit: {
    baseApy: number;
    rewardsApy: number;
  };
  depositTokens: TrovesDepositToken[];
  leverage: number;
  contracts: TrovesContract[];
  tvlUsd: number;
  status: {
    number: number;
    value: string;
  };
  liveStatus?: string;
  riskFactor: number;
  riskFactors?: Array<{ name: string; value: number }>;
  isAudited: boolean;
  auditUrl?: string;
  realizedApy?: number;
  apyMethodology?: string;
  realizedApyMethodology?: string;
  assets: string[];
  protocols: string[];
  tags?: string[];
  isRetired: boolean;
  isDeprecated?: boolean;
  lastAumUpdate?: string;
  discontinuationInfo?: {
    // Troves API boundary: can be omitted or null.
    date?: string | null;
    reason?: unknown;
    info?: unknown;
  };
  curator?: unknown;
  redemptionInfo?: unknown;
  points?: unknown[];
}

export interface TrovesStrategiesResponse {
  status: boolean;
  lastUpdated: string;
  source: string;
  strategies: TrovesStrategyAPIResult[];
}

export interface TrovesStatsResponse {
  tvl: number;
  lastUpdated: string;
}

export interface TrovesRawCall {
  contractAddress: Address;
  entrypoint: string;
  calldata: (string | number | boolean)[];
}

/**
 * Parameters for the noob-safe `deposit` API.
 *
 * `amount` is an `Amount` so token decimals travel with the value — you
 * can't accidentally deposit 100 wei thinking you typed "100 STRK".
 *
 * Build amounts via `Amount.parse("1", STRK)` (human units) or
 * `Amount.fromRaw(rawBigInt, STRK)` (raw base units).
 */
export interface TrovesDepositParams {
  strategyId: string;
  amount: Amount;
  /** Second asset for multi-asset strategies (e.g. LP positions). */
  amount2?: Amount;
}

/**
 * Parameters for the noob-safe `withdraw` API. Same shape as
 * {@link TrovesDepositParams} — aliased for call-site clarity, mirroring
 * the codebase's `LendingDepositRequest` / `LendingWithdrawRequest` split.
 */
export type TrovesWithdrawParams = TrovesDepositParams;

/**
 * The wallet's position in a Troves strategy.
 *
 * `amounts` lists the underlying tokens backing the position in the same
 * order as the strategy's `depositToken[]` — one entry for ERC4626-style
 * strategies, two for dual-asset LP strategies (e.g. Ekubo Automated LPs).
 */
export interface TrovesPosition {
  strategyId: string;
  /** Vault contract address that holds the user's shares. */
  vaultAddress: Address;
  /** Raw share balance from the vault. */
  shares: bigint;
  /** Underlying asset amounts backing these shares right now. */
  amounts: Amount[];
}

/**
 * Low-level params for `populate*Calls` — accepts raw base-unit strings
 * directly. Prefer `TrovesDepositParams` for the typed `deposit`/`withdraw`
 * API; reach for these only when composing Troves calls into a multicall
 * with other operations.
 */
export interface TrovesCallParams {
  strategyId: string;
  amountRaw: string;
  amount2Raw?: string;
  address?: Address;
}

export interface TrovesCallTokenInfo {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

export interface TrovesCallResult {
  tokenInfo: TrovesCallTokenInfo;
  calls: TrovesRawCall[];
  alerts?: string[];
}

export interface TrovesDepositCallsResponse {
  success: boolean;
  results: TrovesCallResult[];
  strategyId: string;
  isDeposit: boolean;
}
