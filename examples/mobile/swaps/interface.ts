import type {
  ChainId,
  PreparedSwapPlan,
  SwapPrepareRequest,
  SwapProvider,
  SwapQuote,
  Token,
} from "starkzap";

export type SwapQuoteSummary = SwapQuote;
export type PrepareSwapParams = SwapPrepareRequest;
export type SwapExecutionPlan = PreparedSwapPlan<SwapQuoteSummary>;

export interface SwapIntegrationContext {
  chainId: ChainId;
  tokens: Token[];
}

export interface SwapIntegrationPairContext extends SwapIntegrationContext {
  tokenIn: Token;
}

export interface SwapIntegration
  extends SwapProvider<PrepareSwapParams, SwapQuoteSummary> {
  id: string;
  label: string;
  getAvailableTokens?: (context: SwapIntegrationContext) => Token[];
  getRecommendedOutputToken?: (
    context: SwapIntegrationPairContext
  ) => Token | null;
}
