import {
  assertAmountMatchesToken,
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

export function validateDcaCreateAmounts(request: DcaCreateRequest): void {
  assertAmountMatchesToken(request.sellAmount, request.sellToken);
  assertAmountMatchesToken(request.sellAmountPerCycle, request.sellToken);

  if (!request.sellAmount.isPositive()) {
    throw new Error("DCA sellAmount must be greater than zero");
  }
  if (!request.sellAmountPerCycle.isPositive()) {
    throw new Error("DCA sellAmountPerCycle must be greater than zero");
  }
  if (request.sellAmountPerCycle.toBase() > request.sellAmount.toBase()) {
    throw new Error("DCA sellAmountPerCycle cannot exceed sellAmount");
  }
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
  const request: DcaCreateRequest = {
    sellToken: input.sellToken,
    buyToken: input.buyToken,
    sellAmount: input.sellAmount,
    sellAmountPerCycle: input.sellAmountPerCycle,
    frequency: input.frequency,
    traderAddress: resolveAddressOrDefault(input.traderAddress, walletAddress),
  };

  if (input.pricingStrategy != null) {
    request.pricingStrategy = input.pricingStrategy;
  }

  return request;
}

export function hydrateDcaOrdersInput(
  input: DcaOrdersInput,
  walletAddress: Address
): DcaOrdersRequest {
  const request: DcaOrdersRequest = {
    traderAddress: resolveAddressOrDefault(input.traderAddress, walletAddress),
  };

  if (input.status != null) {
    request.status = input.status;
  }
  if (input.page != null) {
    request.page = input.page;
  }
  if (input.size != null) {
    request.size = input.size;
  }
  if (input.sort != null) {
    request.sort = input.sort;
  }

  return request;
}

export function hydrateDcaCancelInput(input: DcaCancelInput): DcaCancelRequest {
  const orderId =
    input.orderId != null && input.orderId.length > 0
      ? input.orderId
      : undefined;
  const orderAddress =
    input.orderAddress != null
      ? resolveWalletAddress(input.orderAddress)
      : undefined;

  if (orderId && orderAddress) {
    return {
      orderId,
      orderAddress,
    };
  }

  if (orderId) {
    return { orderId };
  }

  if (orderAddress) {
    return { orderAddress };
  }

  throw new Error("DCA cancel requires either orderId or orderAddress");
}
