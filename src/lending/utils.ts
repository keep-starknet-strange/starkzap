import type { Address, ChainId } from "@/types";
import type {
  LendingBorrowRequest,
  LendingDepositRequest,
  LendingHealthRequest,
  LendingProvider,
  LendingProviderResolver,
  LendingRepayRequest,
  LendingRequestBase,
  LendingWithdrawMaxRequest,
  LendingWithdrawRequest,
} from "@/lending/interface";

export function resolveLendingSource(
  source: LendingProvider | string | undefined,
  resolver: LendingProviderResolver
): LendingProvider {
  if (source == null) {
    return resolver.getDefaultLendingProvider();
  }
  if (typeof source === "string") {
    return resolver.getLendingProvider(source);
  }
  return source;
}

export function assertLendingContext(
  provider: LendingProvider,
  walletChainId: ChainId
): void {
  const chain = walletChainId.toLiteral();
  if (!provider.supportsChain(walletChainId)) {
    throw new Error(
      `Lending provider "${provider.id}" does not support chain "${chain}"`
    );
  }
}

type RequestWithoutProvider<T extends LendingRequestBase> = Omit<T, "provider">;

export function stripProvider<T extends LendingRequestBase>(
  request: T
): RequestWithoutProvider<T> {
  const { provider: _provider, ...rest } = request;
  return rest;
}

export function hydrateDepositRequest(
  request: LendingDepositRequest,
  walletAddress: Address
): RequestWithoutProvider<LendingDepositRequest> {
  return {
    ...stripProvider(request),
    receiver: request.receiver ?? walletAddress,
  };
}

export function hydrateWithdrawRequest(
  request: LendingWithdrawRequest,
  walletAddress: Address
): RequestWithoutProvider<LendingWithdrawRequest> {
  return {
    ...stripProvider(request),
    receiver: request.receiver ?? walletAddress,
    owner: request.owner ?? walletAddress,
  };
}

export function hydrateWithdrawMaxRequest(
  request: LendingWithdrawMaxRequest,
  walletAddress: Address
): RequestWithoutProvider<LendingWithdrawMaxRequest> {
  return {
    ...stripProvider(request),
    receiver: request.receiver ?? walletAddress,
    owner: request.owner ?? walletAddress,
  };
}

export function hydrateBorrowRequest(
  request: LendingBorrowRequest,
  walletAddress: Address
): RequestWithoutProvider<LendingBorrowRequest> {
  return {
    ...stripProvider(request),
    user: request.user ?? walletAddress,
    collateralDenomination: request.collateralDenomination ?? "assets",
    debtDenomination: request.debtDenomination ?? "assets",
  };
}

export function hydrateRepayRequest(
  request: LendingRepayRequest,
  walletAddress: Address
): RequestWithoutProvider<LendingRepayRequest> {
  return {
    ...stripProvider(request),
    user: request.user ?? walletAddress,
    collateralDenomination: request.collateralDenomination ?? "assets",
    withdrawCollateral: request.withdrawCollateral ?? false,
    debtDenomination: request.debtDenomination ?? "assets",
  };
}

export function hydrateHealthRequest(
  request: LendingHealthRequest,
  walletAddress: Address
): RequestWithoutProvider<LendingHealthRequest> {
  return {
    ...stripProvider(request),
    user: request.user ?? walletAddress,
  };
}
