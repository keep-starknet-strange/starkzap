import type { Address } from "@/types/address";

export interface TrovesDepositToken {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  logo?: string;
}

export interface TrovesStrategyAPIResult {
  name: string;
  id: string;
  apy: number | string;
  apySplit: {
    baseApy: number;
    rewardsApy: number;
  };
  depositToken: TrovesDepositToken[];
  leverage: number;
  contract: Array<{
    name: string;
    address: Address;
  }>;
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

export interface TrovesCallParams {
  strategyId: string;
  amountRaw: string;
  amount2Raw?: string;
  address?: string;
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
