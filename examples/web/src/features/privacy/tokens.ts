import { TONGO_CONTRACTS } from "~/lib/stores/config";

export interface PrivacyToken {
  symbol: string;
  contractAddress: string;
  decimals: number;
}

const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  ETH: 18,
  DAI: 18,
  USDC: 6,
  "USDC.e": 6,
  USDT: 6,
  WBTC: 8,
};

/** Tokens with a Tongo confidential contract on the configured network. */
export function privacyTokens(): PrivacyToken[] {
  return Object.entries(TONGO_CONTRACTS).map(([symbol, contractAddress]) => ({
    symbol,
    contractAddress,
    decimals: TOKEN_DECIMALS[symbol] ?? 18,
  }));
}
