import {
  AvnuSwapProvider,
  EkuboSwapProvider,
  type ChainId,
  type SwapProvider,
  type Token,
} from "starkzap";

const SEPOLIA_OUTPUT_CANDIDATES = ["USDC.e", "USDC", "ETH"] as const;
const MAINNET_OUTPUT_CANDIDATES = ["USDC", "USDT", "DAI", "ETH"] as const;

export const swapProviders: SwapProvider[] = [
  new AvnuSwapProvider(),
  new EkuboSwapProvider(),
];

export function getSwapProviderLabel(provider: SwapProvider): string {
  return provider.id.toUpperCase();
}

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

export function getRecommendedOutputToken(params: {
  chainId: ChainId;
  tokenIn: Token;
  tokens: Token[];
}): Token | null {
  const candidates = params.chainId.isSepolia()
    ? SEPOLIA_OUTPUT_CANDIDATES
    : MAINNET_OUTPUT_CANDIDATES;

  for (const symbol of candidates) {
    const token = params.tokens.find(
      (candidate) => candidate.symbol === symbol
    );
    if (token && token.address !== params.tokenIn.address) {
      return token;
    }
  }

  return (
    params.tokens.find((token) => token.address !== params.tokenIn.address) ??
    null
  );
}
