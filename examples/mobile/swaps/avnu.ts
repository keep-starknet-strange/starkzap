import { AvnuSwapProvider, type Token } from "starkzap";
import type {
  SwapIntegration,
  SwapIntegrationContext,
  SwapIntegrationPairContext,
} from "@/swaps/interface";

const provider = new AvnuSwapProvider();

function dedupeAndSortTokens(tokens: Token[]): Token[] {
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

function findTokenBySymbol(tokens: Token[], symbol: string): Token | null {
  const found = tokens.find((token) => token.symbol === symbol);
  return found ?? null;
}

function getAvailableTokens(context: SwapIntegrationContext): Token[] {
  return dedupeAndSortTokens(context.tokens);
}

function getRecommendedOutputToken(
  context: SwapIntegrationPairContext
): Token | null {
  const { chainId, tokenIn, tokens } = context;
  const candidates = chainId.isSepolia()
    ? ["USDC.e", "USDC", "ETH"]
    : ["USDC", "USDT", "DAI", "ETH"];

  for (const symbol of candidates) {
    const token = findTokenBySymbol(tokens, symbol);
    if (token && token.address !== tokenIn.address) {
      return token;
    }
  }

  return tokens.find((token) => token.address !== tokenIn.address) ?? null;
}

export const avnuSwapIntegration: SwapIntegration = {
  id: "avnu",
  label: "AVNU",
  supportsChain: (chainId) => provider.supportsChain(chainId),
  getAvailableTokens,
  getRecommendedOutputToken,
  getQuote: (params) => provider.getQuote(params),
  swap: (params) => provider.swap(params),
};
