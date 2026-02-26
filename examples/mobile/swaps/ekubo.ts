import { EkuboSwapProvider } from "starkzap";
import type { SwapIntegration } from "@/swaps/interface";
import { getAvailableTokens, getRecommendedOutputToken } from "@/swaps/helpers";

const provider = new EkuboSwapProvider();

export const ekuboSwapIntegration: SwapIntegration = {
  id: "ekubo",
  label: "Ekubo",
  supportsChain: (chainId) => provider.supportsChain(chainId),
  getAvailableTokens,
  getRecommendedOutputToken,
  getQuote: (params) => provider.getQuote(params),
  swap: (params) => provider.swap(params),
};
