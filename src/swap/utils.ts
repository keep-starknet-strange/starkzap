import type { Address, ChainId } from "@/types";
import type {
  SwapInput,
  SwapProvider,
  SwapRequest,
  SwapSource,
} from "@/swap/interface";

interface SwapSourceResolver {
  getDefaultSwapProvider(): SwapProvider;
  getSwapProvider(providerId: string): SwapProvider;
}

export function resolveSwapSource(
  source: SwapSource | undefined,
  resolver: SwapSourceResolver
): SwapProvider {
  if (!source) {
    return resolver.getDefaultSwapProvider();
  }
  if (typeof source === "string") {
    return resolver.getSwapProvider(source);
  }
  return source;
}

export function hydrateSwapRequest(
  input: SwapInput,
  walletContext: { chainId: ChainId; takerAddress: Address }
): SwapRequest {
  return {
    chainId: input.chainId ?? walletContext.chainId,
    takerAddress: input.takerAddress ?? walletContext.takerAddress,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: input.amountIn,
    ...(input.slippageBps != null && { slippageBps: input.slippageBps }),
  };
}

export function assertSwapContext(
  provider: SwapProvider,
  request: SwapRequest,
  walletChainId: ChainId
): void {
  const walletChain = walletChainId.toLiteral();
  const requestChain = request.chainId.toLiteral();
  if (requestChain !== walletChain) {
    throw new Error(
      `Swap request chain "${requestChain}" does not match wallet chain "${walletChain}"`
    );
  }
  if (!provider.supportsChain(request.chainId)) {
    throw new Error(
      `Swap provider "${provider.id}" does not support chain "${requestChain}"`
    );
  }
}
