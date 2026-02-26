import type { ChainId, SwapProvider, Token } from "starkzap";

export interface SwapIntegrationContext {
  chainId: ChainId;
  tokens: Token[];
}

export interface SwapIntegrationPairContext extends SwapIntegrationContext {
  tokenIn: Token;
}

export interface SwapIntegration extends SwapProvider {
  label: string;
  getAvailableTokens?: (context: SwapIntegrationContext) => Token[];
  getRecommendedOutputToken?: (
    context: SwapIntegrationPairContext
  ) => Token | null;
}
