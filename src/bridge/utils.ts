import type { Address, ChainId } from "@/types";
import type {
  BridgeInput,
  BridgeProvider,
  BridgeRequest,
} from "@/bridge/interface";

export function resolveBridgeSource(
  source: BridgeProvider | string | undefined,
  resolver: {
    getDefaultBridgeProvider(): BridgeProvider;
    getBridgeProvider(providerId: string): BridgeProvider;
  }
): BridgeProvider {
  if (source == null) {
    return resolver.getDefaultBridgeProvider();
  }
  if (typeof source === "string") {
    return resolver.getBridgeProvider(source);
  }
  return source;
}

export function hydrateBridgeRequest(
  input: BridgeInput,
  walletContext: { chainId: ChainId; recipient?: Address }
): BridgeRequest {
  return {
    sourceChainId: input.sourceChainId ?? walletContext.chainId,
    destChainId: input.destChainId ?? walletContext.chainId,
    token: input.token,
    amount: input.amount,
    recipient: input.recipient ?? walletContext.recipient!,
    ...(input.slippageBps != null && { slippageBps: input.slippageBps }),
  };
}

export function assertBridgeContext(
  provider: BridgeProvider,
  request: BridgeRequest,
  walletChainId: ChainId
): void {
  const walletChain = walletChainId.toLiteral();
  const sourceChain = request.sourceChainId.toLiteral();
  const destChain = request.destChainId.toLiteral();

  if (sourceChain !== walletChain) {
    throw new Error(
      `Bridge source chain "${sourceChain}" does not match wallet chain "${walletChain}"`
    );
  }

  if (!provider.supportsChainPair(request.sourceChainId, request.destChainId)) {
    throw new Error(
      `Bridge provider "${provider.id}" does not support chain pair "${sourceChain}" -> "${destChain}"`
    );
  }
}

export function resolveBridgeInput(
  input: BridgeInput,
  context: {
    walletChainId: ChainId;
    walletAddress: Address;
    providerResolver: {
      getDefaultBridgeProvider(): BridgeProvider;
      getBridgeProvider(providerId: string): BridgeProvider;
    };
  }
): {
  provider: BridgeProvider;
  request: BridgeRequest;
} {
  const provider = resolveBridgeSource(
    input.provider,
    context.providerResolver
  );
  const request = hydrateBridgeRequest(input, {
    chainId: context.walletChainId,
    recipient: input.recipient ?? context.walletAddress,
  }) as BridgeRequest;

  // Validate recipient is provided
  if (!request.recipient) {
    throw new Error("Bridge recipient is required");
  }

  assertBridgeContext(provider, request, context.walletChainId);
  return { provider, request };
}
