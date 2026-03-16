import {
  cancelDcaToCalls,
  createDcaToCalls,
  getDcaOrders,
  DcaOrderStatus as AvnuDcaOrderStatus,
  type DcaOrder as AvnuDcaOrder,
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
  DcaOrderStatus,
  DcaPricingStrategy,
  DcaProvider,
  DcaProviderContext,
  DcaTrade,
  PreparedDcaAction,
} from "@/dca/interface";
import { validateDcaCreateAmounts } from "@/dca/utils";
import {
  DEFAULT_AVNU_API_BASES,
  normalizeAvnuCalls,
  supportsAvnuChain,
  withAvnuApiBaseFallback,
} from "@/utils/avnu";

function toHexAmount(value: bigint): string {
  return `0x${value.toString(16)}`;
}

const DCA_STATUS_TO_AVNU: Record<DcaOrderStatus, AvnuDcaOrderStatus> = {
  INDEXING: AvnuDcaOrderStatus.INDEXING,
  ACTIVE: AvnuDcaOrderStatus.ACTIVE,
  CLOSED: AvnuDcaOrderStatus.CLOSED,
};

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
    ...(minBuyAmountBase != null && {
      tokenToMinAmount: toHexAmount(minBuyAmountBase),
    }),
    ...(maxBuyAmountBase != null && {
      tokenToMaxAmount: toHexAmount(maxBuyAmountBase),
    }),
  } as PricingStrategy;
}

function validateCreateRequest(request: DcaCreateRequest): void {
  validateDcaCreateAmounts(request);

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
  const pricingStrategy: DcaPricingStrategy = {};

  if ("tokenToMinAmount" in strategy && strategy.tokenToMinAmount) {
    pricingStrategy.minBuyAmountBase = BigInt(strategy.tokenToMinAmount);
  }
  if ("tokenToMaxAmount" in strategy && strategy.tokenToMaxAmount) {
    pricingStrategy.maxBuyAmountBase = BigInt(strategy.tokenToMaxAmount);
  }

  return pricingStrategy;
}

function mapTrade(trade: AvnuDcaTrade): DcaTrade {
  const mappedTrade: DcaTrade = {
    sellAmountBase: trade.sellAmount,
    expectedTradeDate: trade.expectedTradeDate,
    status: trade.status,
  };

  if (trade.sellAmountInUsd != null) {
    mappedTrade.sellAmountInUsd = trade.sellAmountInUsd;
  }
  if (trade.buyAmount != null) {
    mappedTrade.buyAmountBase = trade.buyAmount;
  }
  if (trade.buyAmountInUsd != null) {
    mappedTrade.buyAmountInUsd = trade.buyAmountInUsd;
  }
  if (trade.actualTradeDate) {
    mappedTrade.actualTradeDate = trade.actualTradeDate;
  }
  if (trade.txHash) {
    mappedTrade.txHash = trade.txHash;
  }
  if (trade.errorReason) {
    mappedTrade.errorReason = trade.errorReason;
  }

  return mappedTrade;
}

function mapOrder(order: AvnuDcaOrder): DcaOrder {
  const mappedOrder: DcaOrder = {
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

  if (order.closeDate) {
    mappedOrder.closeDate = order.closeDate;
  }

  return mappedOrder;
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
    const avnuRequest: Parameters<typeof getDcaOrders>[0] = {
      traderAddress: request.traderAddress,
    };

    if (request.status) {
      avnuRequest.status = DCA_STATUS_TO_AVNU[request.status];
    }
    if (request.page != null) {
      avnuRequest.page = request.page;
    }
    if (request.size != null) {
      avnuRequest.size = request.size;
    }
    if (request.sort) {
      avnuRequest.sort = request.sort;
    }

    const page = await withAvnuApiBaseFallback({
      apiBasesByChain: this.apiBases,
      chainId: context.chainId,
      feature: "DCA",
      action: "get DCA orders",
      run: (baseUrl) => getDcaOrders(avnuRequest, { baseUrl }),
    });

    return {
      content: page.content.map(mapOrder),
      totalPages: page.totalPages,
      totalElements: page.totalElements,
      size: page.size,
      pageNumber: page.number,
    };
  }

  async prepareCreate(
    context: DcaProviderContext,
    request: DcaCreateRequest
  ): Promise<PreparedDcaAction> {
    validateCreateRequest(request);
    const createRequest: Parameters<typeof createDcaToCalls>[0] = {
      sellTokenAddress: request.sellToken.address,
      buyTokenAddress: request.buyToken.address,
      sellAmount: toHexAmount(request.sellAmount.toBase()),
      sellAmountPerCycle: toHexAmount(request.sellAmountPerCycle.toBase()),
      frequency: {
        toJSON: () => request.frequency,
        toISOString: () => request.frequency,
      } as Duration,
      pricingStrategy: toPricingStrategy(request.pricingStrategy),
      traderAddress: request.traderAddress,
    };

    const calls = await withAvnuApiBaseFallback({
      apiBasesByChain: this.apiBases,
      chainId: context.chainId,
      feature: "DCA",
      action: "prepare DCA create",
      run: async (baseUrl) => {
        const response = await createDcaToCalls(createRequest, { baseUrl });

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
      run: async (baseUrl) => {
        const response = await cancelDcaToCalls(orderAddress, { baseUrl });

        return normalizeAvnuCalls(
          response.calls,
          "AVNU DCA cancel returned no calls"
        );
      },
    });

    return {
      providerId: this.id,
      action: "cancel",
      calls,
      orderAddress,
    };
  }
}
