import {
  resolveWalletAddress,
  type Address,
  type AddressInput,
  type ChainId,
} from "@/types";
import type {
  DcaCancelInput,
  DcaCancelRequest,
  DcaCreateInput,
  DcaCreateRequest,
  DcaOrdersInput,
  DcaOrdersRequest,
  DcaProvider,
  DcaProviderResolver,
} from "@/dca/interface";

export function resolveDcaSource(
  source: DcaProvider | string | undefined,
  resolver: DcaProviderResolver
): DcaProvider {
  if (source == null) {
    return resolver.getDefaultDcaProvider();
  }
  if (typeof source === "string") {
    return resolver.getDcaProvider(source);
  }
  return source;
}

export function assertDcaContext(
  provider: DcaProvider,
  chainId: ChainId
): void {
  const requestChain = chainId.toLiteral();
  if (provider.supportsChain(chainId)) {
    return;
  }
  throw new Error(
    `DCA provider "${provider.id}" does not support chain "${requestChain}"`
  );
}

function resolveAddressOrDefault(
  value: AddressInput | undefined,
  fallback: Address
): Address {
  if (value == null) {
    return fallback;
  }
  return resolveWalletAddress(value);
}

export function hydrateDcaCreateInput(
  input: DcaCreateInput,
  walletAddress: Address
): DcaCreateRequest {
  return {
    sellToken: input.sellToken,
    buyToken: input.buyToken,
    sellAmount: input.sellAmount,
    sellAmountPerCycle: input.sellAmountPerCycle,
    frequency: input.frequency,
    traderAddress: resolveAddressOrDefault(input.traderAddress, walletAddress),
    ...(input.pricingStrategy && { pricingStrategy: input.pricingStrategy }),
  };
}

export function hydrateDcaOrdersInput(
  input: DcaOrdersInput,
  walletAddress: Address
): DcaOrdersRequest {
  return {
    traderAddress: resolveAddressOrDefault(input.traderAddress, walletAddress),
    ...(input.status && { status: input.status }),
    ...(input.page != null && { page: input.page }),
    ...(input.size != null && { size: input.size }),
    ...(input.sort && { sort: input.sort }),
  };
}

export function hydrateDcaCancelInput(input: DcaCancelInput): DcaCancelRequest {
  const hasOrderId = input.orderId != null && input.orderId.length > 0;
  const hasOrderAddress = input.orderAddress != null;

  if (!hasOrderId && !hasOrderAddress) {
    throw new Error("DCA cancel requires either orderId or orderAddress");
  }

  return {
    ...(hasOrderId && { orderId: input.orderId }),
    ...(hasOrderAddress && {
      orderAddress: resolveWalletAddress(input.orderAddress!),
    }),
  };
}
