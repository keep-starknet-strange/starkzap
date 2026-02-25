import type {
  ChainId,
  PreparedSwap,
  SwapRequest,
  SwapProvider,
  SwapQuote,
  Token,
} from "starkzap";

export type SwapQuoteSummary = SwapQuote;
export type PrepareSwapParams = SwapRequest;
export type SwapExecution = PreparedSwap;

export interface SwapIntegrationContext {
  chainId: ChainId;
  tokens: Token[];
}

export interface SwapIntegrationPairContext extends SwapIntegrationContext {
  tokenIn: Token;
}

export interface SwapIntegration extends SwapProvider {
  id: string;
  label: string;
  getAvailableTokens?: (context: SwapIntegrationContext) => Token[];
  getRecommendedOutputToken?: (
    context: SwapIntegrationPairContext
  ) => Token | null;
}
