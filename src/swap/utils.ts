import type { Address, ChainId } from "@/types";
import type {
  SwapInput,
  SwapProvider,
  SwapProviderResolver,
  SwapRequest,
} from "@/swap/interface";

export function resolveSwapSource(
  source: SwapProvider | string | undefined,
  resolver: SwapProviderResolver
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
  const request: SwapRequest = {
    chainId: input.chainId ?? walletContext.chainId,
    takerAddress: input.takerAddress ?? walletContext.takerAddress,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: input.amountIn,
  };

  if (input.slippageBps != null) {
    request.slippageBps = input.slippageBps;
  }

  return request;
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
    providerResolver: SwapProviderResolver;
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
