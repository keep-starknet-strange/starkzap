import type { Address, ChainId } from "@/types";
import type { SwapInput, SwapProvider, SwapRequest } from "@/swap/interface";

export function resolveSwapSource(
  source: SwapProvider | string | undefined,
  resolver: {
    getDefaultSwapProvider(): SwapProvider;
    getSwapProvider(providerId: string): SwapProvider;
  }
): SwapProvider {
  if (source == null) {
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

export function resolveSwapInput(
  input: SwapInput,
  context: {
    walletChainId: ChainId;
    takerAddress: Address;
    providerResolver: {
      getDefaultSwapProvider(): SwapProvider;
      getSwapProvider(providerId: string): SwapProvider;
    };
  }
): {
  provider: SwapProvider;
  request: SwapRequest;
} {
  const provider = resolveSwapSource(input.provider, context.providerResolver);
  const request = hydrateSwapRequest(input, {
    chainId: context.walletChainId,
    takerAddress: context.takerAddress,
  });
  assertSwapContext(provider, request, context.walletChainId);
  return { provider, request };
}
