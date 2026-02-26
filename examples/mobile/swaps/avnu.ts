import { AvnuSwapProvider } from "starkzap";
import type { SwapIntegration } from "@/swaps/interface";
import { getAvailableTokens, getRecommendedOutputToken } from "@/swaps/helpers";

const provider = new AvnuSwapProvider();

export const avnuSwapIntegration: SwapIntegration = {
  id: "avnu",
  label: "AVNU",
  supportsChain: (chainId) => provider.supportsChain(chainId),
  getAvailableTokens,
  getRecommendedOutputToken,
  getQuote: (params) => provider.getQuote(params),
  swap: (params) => provider.swap(params),
};
