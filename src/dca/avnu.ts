import {
  cancelDcaToCalls,
  createDcaToCalls,
  getDcaOrders,
  type DcaOrder as AvnuDcaOrder,
  type DcaOrderStatus as AvnuDcaOrderStatus,
  type DcaTrade as AvnuDcaTrade,
  type Page as AvnuPage,
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
import { DEFAULT_AVNU_API_BASES, normalizeAvnuCalls } from "@/utils/avnu";

export interface AvnuDcaProviderOptions {
  /** Optional API base override per chain. */
  apiBases?: Partial<Record<"SN_MAIN" | "SN_SEPOLIA", string[]>>;
}

function toHexQuantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseOptionalBigInt(value: string | undefined): bigint | undefined {
  if (value == null || value.length === 0) {
    return undefined;
  }
  return BigInt(value);
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
      minBuyAmountBase != null ? toHexQuantity(minBuyAmountBase) : undefined,
    tokenToMaxAmount:
      maxBuyAmountBase != null ? toHexQuantity(maxBuyAmountBase) : undefined,
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
  if (!("tokenToMinAmount" in strategy) && !("tokenToMaxAmount" in strategy)) {
    return {};
  }

  const minBuyAmountBase = parseOptionalBigInt(strategy.tokenToMinAmount);
  const maxBuyAmountBase = parseOptionalBigInt(strategy.tokenToMaxAmount);

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

function mapOrdersPage(page: AvnuPage<AvnuDcaOrder>): DcaOrdersPage {
  return {
    ...page,
    content: page.content.map(mapOrder),
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
    const literal = chainId.toLiteral();
    return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
  }

  async getOrders(
    context: DcaProviderContext,
    request: DcaOrdersRequest
  ): Promise<DcaOrdersPage> {
    return await this.withApiBaseFallback(
      context.chainId,
      "get DCA orders",
      async (baseUrl) =>
        mapOrdersPage(
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
          )
        )
    );
  }

  async prepareCreate(
    context: DcaProviderContext,
    request: DcaCreateRequest
  ): Promise<PreparedDcaAction> {
    validateCreateRequest(request);

    const calls = await this.withApiBaseFallback(
      context.chainId,
      "prepare DCA create",
      async (baseUrl) => {
        const response = await createDcaToCalls(
          {
            sellTokenAddress: request.sellToken.address,
            buyTokenAddress: request.buyToken.address,
            sellAmount: toHexQuantity(request.sellAmount.toBase()),
            sellAmountPerCycle: toHexQuantity(
              request.sellAmountPerCycle.toBase()
            ),
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
      }
    );

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

    const calls = await this.withApiBaseFallback(
      context.chainId,
      "prepare DCA cancel",
      async (baseUrl) =>
        normalizeAvnuCalls(
          (await cancelDcaToCalls(orderAddress, { baseUrl })).calls,
          "AVNU DCA cancel returned no calls"
        )
    );

    return {
      providerId: this.id,
      action: "cancel",
      calls,
      orderAddress,
    };
  }

  private getApiBases(chainId: ChainId): string[] {
    const literal = chainId.toLiteral();
    let apiBases: string[];

    if (literal === "SN_MAIN") {
      apiBases = this.apiBases.SN_MAIN;
    } else if (literal === "SN_SEPOLIA") {
      apiBases = this.apiBases.SN_SEPOLIA;
    } else {
      throw new Error(`Unsupported chain for AVNU DCA: ${literal}`);
    }

    if (apiBases.length === 0) {
      throw new Error(`No AVNU API base configured for chain: ${literal}`);
    }

    return [...apiBases];
  }

  private async withApiBaseFallback<T>(
    chainId: ChainId,
    action: string,
    run: (baseUrl: string) => Promise<T>
  ): Promise<T> {
    const failures: string[] = [];

    for (const apiBase of this.getApiBases(chainId)) {
      try {
        return await run(apiBase);
      } catch (error) {
        failures.push(`${apiBase}: ${getErrorMessage(error)}`);
      }
    }

    throw new Error(`AVNU ${action} failed (${failures.join(" | ")})`);
  }
}
