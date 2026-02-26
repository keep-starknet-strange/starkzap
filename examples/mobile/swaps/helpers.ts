import type { Token } from "starkzap";
import type {
  SwapIntegrationContext,
  SwapIntegrationPairContext,
} from "@/swaps/interface";

const SEPOLIA_OUTPUT_CANDIDATES = ["USDC.e", "USDC", "ETH"] as const;
const MAINNET_OUTPUT_CANDIDATES = ["USDC", "USDT", "DAI", "ETH"] as const;

export function dedupeAndSortTokens(tokens: Token[]): Token[] {
  const uniqueByAddress = new Map<string, Token>();
  for (const token of tokens) {
    if (!uniqueByAddress.has(token.address)) {
      uniqueByAddress.set(token.address, token);
    }
  }
  return Array.from(uniqueByAddress.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
}

export function getAvailableTokens(context: SwapIntegrationContext): Token[] {
  return dedupeAndSortTokens(context.tokens);
}

export function getRecommendedOutputToken(
  context: SwapIntegrationPairContext
): Token | null {
  const { chainId, tokenIn, tokens } = context;
  const candidates = chainId.isSepolia()
    ? SEPOLIA_OUTPUT_CANDIDATES
    : MAINNET_OUTPUT_CANDIDATES;

  for (const symbol of candidates) {
    const token = tokens.find((candidate) => candidate.symbol === symbol);
    if (token && token.address !== tokenIn.address) {
      return token;
    }
  }

  return tokens.find((token) => token.address !== tokenIn.address) ?? null;
}
