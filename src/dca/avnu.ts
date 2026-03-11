import {
  cancelDcaToCalls,
  createDcaToCalls,
  getDcaOrders,
  type DcaOrder as AvnuDcaOrder,
  type DcaOrderStatus as AvnuDcaOrderStatus,
  type DcaTrade as AvnuDcaTrade,
  type PricingStrategy,
} from "@avnu/avnu-sdk";
import type { Duration } from "moment";
import { assertAmountMatchesToken, fromAddress, type ChainId } from "@/types";
import type {
  DcaCancelRequest,
  DcaCreateRequest,
  DcaOrder,
  DcaOrdersRequest,
  DcaOrdersPage,
  DcaPricingStrategy,
  DcaProvider,
  DcaProviderContext,
  DcaTrade,
  PreparedDcaAction,
} from "@/dca/interface";
import {
  DEFAULT_AVNU_API_BASES,
  normalizeAvnuCalls,
  supportsAvnuChain,
  withAvnuApiBaseFallback,
} from "@/utils/avnu";

export interface AvnuDcaProviderOptions {
  /** Optional API base override per chain. */
  apiBases?: Partial<Record<"SN_MAIN" | "SN_SEPOLIA", string[]>>;
}

function toPricingStrategy(
  strategy: DcaCreateRequest["pricingStrategy"]
): PricingStrategy | Record<string, never> {
  if (!strategy) {
    return {};
  }

  const minBuyAmount = strategy.minBuyAmount;
  const maxBuyAmount = strategy.maxBuyAmount;

  const minBuyAmountBase = minBuyAmount?.toBase();
  const maxBuyAmountBase = maxBuyAmount?.toBase();

  if (
    minBuyAmountBase != null &&
    maxBuyAmountBase != null &&
    minBuyAmountBase > maxBuyAmountBase
  ) {
    throw new Error(
      "DCA pricingStrategy.minBuyAmount cannot exceed pricingStrategy.maxBuyAmount"
    );
  }

  if (minBuyAmountBase == null && maxBuyAmountBase == null) {
    return {};
  }

  return {
    tokenToMinAmount:
      minBuyAmountBase != null
        ? `0x${minBuyAmountBase.toString(16)}`
        : undefined,
    tokenToMaxAmount:
      maxBuyAmountBase != null
        ? `0x${maxBuyAmountBase.toString(16)}`
        : undefined,
  };
}

function validateCreateRequest(request: DcaCreateRequest): void {
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

  const minBuyAmount = request.pricingStrategy?.minBuyAmount;
  const maxBuyAmount = request.pricingStrategy?.maxBuyAmount;
  if (minBuyAmount) {
    assertAmountMatchesToken(minBuyAmount, request.buyToken);
  }
  if (maxBuyAmount) {
    assertAmountMatchesToken(maxBuyAmount, request.buyToken);
  }
}

function mapPricingStrategy(
  strategy: AvnuDcaOrder["pricingStrategy"]
): DcaPricingStrategy {
  const minBuyAmountBase =
    "tokenToMinAmount" in strategy && strategy.tokenToMinAmount
      ? BigInt(strategy.tokenToMinAmount)
      : undefined;
  const maxBuyAmountBase =
    "tokenToMaxAmount" in strategy && strategy.tokenToMaxAmount
      ? BigInt(strategy.tokenToMaxAmount)
      : undefined;

  if (minBuyAmountBase == null && maxBuyAmountBase == null) {
    return {};
  }

  return {
    ...(minBuyAmountBase != null && { minBuyAmountBase }),
    ...(maxBuyAmountBase != null && { maxBuyAmountBase }),
  };
}

function mapTrade(trade: AvnuDcaTrade): DcaTrade {
  return {
    sellAmountBase: trade.sellAmount,
    ...(trade.sellAmountInUsd != null && {
      sellAmountInUsd: trade.sellAmountInUsd,
    }),
    ...(trade.buyAmount != null && { buyAmountBase: trade.buyAmount }),
    ...(trade.buyAmountInUsd != null && {
      buyAmountInUsd: trade.buyAmountInUsd,
    }),
    expectedTradeDate: trade.expectedTradeDate,
    ...(trade.actualTradeDate && { actualTradeDate: trade.actualTradeDate }),
    status: trade.status,
    ...(trade.txHash && { txHash: trade.txHash }),
    ...(trade.errorReason && { errorReason: trade.errorReason }),
  };
}

function mapOrder(order: AvnuDcaOrder): DcaOrder {
  return {
    id: order.id,
    providerId: "avnu",
    blockNumber: order.blockNumber,
    timestamp: order.timestamp,
    traderAddress: fromAddress(order.traderAddress),
    orderAddress: fromAddress(order.orderAddress),
    creationTransactionHash: order.creationTransactionHash,
    orderClassHash: order.orderClassHash,
    sellTokenAddress: fromAddress(order.sellTokenAddress),
    sellAmountBase: order.sellAmount,
    sellAmountPerCycleBase: order.sellAmountPerCycle,
    buyTokenAddress: fromAddress(order.buyTokenAddress),
    startDate: order.startDate,
    endDate: order.endDate,
    ...(order.closeDate && { closeDate: order.closeDate }),
    frequency: order.frequency,
    iterations: order.iterations,
    status: order.status,
    pricingStrategy: mapPricingStrategy(order.pricingStrategy),
    amountSoldBase: order.amountSold,
    amountBoughtBase: order.amountBought,
    averageAmountBoughtBase: order.averageAmountBought,
    executedTradesCount: order.executedTradesCount,
    cancelledTradesCount: order.cancelledTradesCount,
    pendingTradesCount: order.pendingTradesCount,
    trades: order.trades.map(mapTrade),
  };
}

export class AvnuDcaProvider implements DcaProvider {
  readonly id = "avnu";

  private readonly apiBases: Record<"SN_MAIN" | "SN_SEPOLIA", string[]>;

  constructor(options: AvnuDcaProviderOptions = {}) {
    this.apiBases = {
      SN_MAIN: options.apiBases?.SN_MAIN ?? [...DEFAULT_AVNU_API_BASES.SN_MAIN],
      SN_SEPOLIA: options.apiBases?.SN_SEPOLIA ?? [
        ...DEFAULT_AVNU_API_BASES.SN_SEPOLIA,
      ],
    };
  }

  supportsChain(chainId: ChainId): boolean {
    return supportsAvnuChain(chainId);
  }

  async getOrders(
    context: DcaProviderContext,
    request: DcaOrdersRequest
  ): Promise<DcaOrdersPage> {
    const page = await withAvnuApiBaseFallback({
      apiBasesByChain: this.apiBases,
      chainId: context.chainId,
      feature: "DCA",
      action: "get DCA orders",
      run: async (baseUrl) =>
        await getDcaOrders(
          {
            traderAddress: request.traderAddress,
            ...(request.status && {
              status: request.status as AvnuDcaOrderStatus,
            }),
            ...(request.page != null && { page: request.page }),
            ...(request.size != null && { size: request.size }),
            ...(request.sort && { sort: request.sort }),
          },
          { baseUrl }
        ),
    });

    return {
      ...page,
      content: page.content.map(mapOrder),
    };
  }

  async prepareCreate(
    context: DcaProviderContext,
    request: DcaCreateRequest
  ): Promise<PreparedDcaAction> {
    validateCreateRequest(request);

    const calls = await withAvnuApiBaseFallback({
      apiBasesByChain: this.apiBases,
      chainId: context.chainId,
      feature: "DCA",
      action: "prepare DCA create",
      run: async (baseUrl) => {
        const response = await createDcaToCalls(
          {
            sellTokenAddress: request.sellToken.address,
            buyTokenAddress: request.buyToken.address,
            sellAmount: `0x${request.sellAmount.toBase().toString(16)}`,
            sellAmountPerCycle: `0x${request.sellAmountPerCycle
              .toBase()
              .toString(16)}`,
            frequency: request.frequency as unknown as Duration,
            pricingStrategy: toPricingStrategy(request.pricingStrategy),
            traderAddress: request.traderAddress,
          },
          { baseUrl }
        );

        return normalizeAvnuCalls(
          response.calls,
          "AVNU DCA create returned no calls"
        );
      },
    });

    return {
      providerId: this.id,
      action: "create",
      calls,
    };
  }

  async prepareCancel(
    context: DcaProviderContext,
    request: DcaCancelRequest
  ): Promise<PreparedDcaAction> {
    if (!request.orderAddress) {
      throw new Error("AVNU DCA cancel requires an orderAddress");
    }
    const orderAddress = request.orderAddress;

    const calls = await withAvnuApiBaseFallback({
      apiBasesByChain: this.apiBases,
      chainId: context.chainId,
      feature: "DCA",
      action: "prepare DCA cancel",
      run: async (baseUrl) =>
        normalizeAvnuCalls(
          (await cancelDcaToCalls(orderAddress, { baseUrl })).calls,
          "AVNU DCA cancel returned no calls"
        ),
    });

    return {
      providerId: this.id,
      action: "cancel",
      calls,
      orderAddress,
    };
  }
}
