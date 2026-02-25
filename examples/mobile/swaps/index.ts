import type { SwapIntegration } from "@/swaps/interface";
import { avnuSwapIntegration } from "@/swaps/avnu";
import { ekuboSwapIntegration } from "@/swaps/ekubo";

export const swapIntegrations: SwapIntegration[] = [
  avnuSwapIntegration,
  ekuboSwapIntegration,
];
