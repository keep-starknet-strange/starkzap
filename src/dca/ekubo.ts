import { CallData, cairo, type Call } from "starknet";
import { fromAddress, type Address, type ChainId } from "@/types";
import type {
  DcaCancelRequest,
  DcaCreateRequest,
  DcaOrdersPage,
  DcaOrdersRequest,
  DcaProvider,
  DcaProviderContext,
  PreparedDcaAction,
} from "@/dca/interface";
import {
  alignEkuboTime,
  assertFitsU128,
  assertNonNegativeInteger,
  buildEkuboOrderDescriptors,
  decodeEkuboOrderId,
  DEFAULT_EKUBO_DCA_API_BASE,
  MINIMUM_START_DELAY_SECONDS,
  parseEkuboOrdersResponse,
  parseEkuboPoolsResponse,
  parseIsoDurationSeconds,
  parseOrderInfoResult,
  parseOrderInfosResult,
  pickTwammPoolFee,
  toEkuboApiChainId,
  toEkuboDcaOrder,
  toOrderInfoCalldata,
  type EkuboApiOrdersResponse,
  type EkuboOnChainOrderInfo,
  type ParsedEkuboOrderId,
} from "@/dca/ekubo.helpers";
import { validateDcaCreateAmounts } from "@/dca/utils";
import {
  getEkuboChainLiteral,
  getEkuboErrorMessageFromPayload,
  supportsEkuboChain,
} from "@/utils/ekubo";
import {
  DEFAULT_EKUBO_API_BASE,
  getEkuboQuoterChainId,
  parseEkuboQuoteResponse,
} from "@/swap/ekubo.helpers";

const MAX_U32 = 2n ** 32n - 1n;
const DEFAULT_EKUBO_REQUEST_TIMEOUT_MS = 10_000;

interface EkuboDcaConfig {
  positions: Address;
  positionsNft: Address;
  twammExtension: Address;
  fallbackTwammPoolFee?: bigint;
}

export const ekuboDcaPresets = {
  SN_MAIN: {
    positions: fromAddress(
      "0x02e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067"
    ),
    positionsNft: fromAddress(
      "0x07b696af58c967c1b14c9dde0ace001720635a660a8e90c565ea459345318b30"
    ),
    twammExtension: fromAddress(
      "0x043e4f09c32d13d43a880e85f69f7de93ceda62d6cf2581a582c6db635548fdc"
    ),
  },
  SN_SEPOLIA: {
    positions: fromAddress(
      "0x06a2aee84bb0ed5dded4384ddd0e40e9c1372b818668375ab8e3ec08807417e5"
    ),
    positionsNft: fromAddress(
      "0x04afc78d6fec3b122fc1f60276f074e557749df1a77a93416451be72c435120f"
    ),
    twammExtension: fromAddress(
      "0x073ec792c33b52d5f96940c2860d512b3884f2127d25e023eb9d44a678e4b971"
    ),
  },
} as const satisfies Record<"SN_MAIN" | "SN_SEPOLIA", EkuboDcaConfig>;

export interface EkuboDcaProviderOptions {
  /** Optional Ekubo API base URL override. */
  apiBase?: string;
  /** Optional Ekubo swap quote API base URL override. */
  quoteApiBase?: string;
  /** Optional fetch implementation override for custom runtimes/tests. */
  fetcher?: typeof fetch;
  /** Optional minimum TVL filter passed to Ekubo pair-pools discovery. */
  minTvlUsd?: number;
  /** Optional chain-aware preset overrides. */
  presets?: Partial<Record<"SN_MAIN" | "SN_SEPOLIA", Partial<EkuboDcaConfig>>>;
}

function validateCreateRequest(request: DcaCreateRequest): void {
  validateDcaCreateAmounts(request);
  if (request.pricingStrategy) {
    throw new Error("Ekubo DCA does not support pricingStrategy constraints");
  }

  assertFitsU128(request.sellAmount.toBase(), "Ekubo DCA sellAmount");
}

export function getEkuboDcaPreset(chainId: ChainId): EkuboDcaConfig {
  return ekuboDcaPresets[getEkuboChainLiteral(chainId, "DCA")];
}

export class EkuboDcaProvider implements DcaProvider {
  readonly id = "ekubo";

  private readonly apiBase: string;
  private readonly quoteApiBase: string;
  private readonly fetcher: typeof fetch;
  private readonly minTvlUsd: number;
  private readonly presets: Record<"SN_MAIN" | "SN_SEPOLIA", EkuboDcaConfig>;

  constructor(options: EkuboDcaProviderOptions = {}) {
    this.apiBase = options.apiBase ?? DEFAULT_EKUBO_DCA_API_BASE;
    this.quoteApiBase = options.quoteApiBase ?? DEFAULT_EKUBO_API_BASE;
    this.fetcher = options.fetcher ?? fetch;
    this.minTvlUsd = options.minTvlUsd ?? 0;
    this.presets = {
      SN_MAIN: {
        ...ekuboDcaPresets.SN_MAIN,
        ...options.presets?.SN_MAIN,
      },
      SN_SEPOLIA: {
        ...ekuboDcaPresets.SN_SEPOLIA,
        ...options.presets?.SN_SEPOLIA,
      },
    };
  }

  supportsChain(chainId: ChainId): boolean {
    return supportsEkuboChain(chainId);
  }

  async getOrders(
    context: DcaProviderContext,
    request: DcaOrdersRequest
  ): Promise<DcaOrdersPage> {
    if (request.status === "INDEXING") {
      const size = request.size ?? 50;
      return {
        content: [],
        totalPages: 0,
        totalElements: 0,
        size,
        pageNumber: request.page ?? 0,
      };
    }

    const preset = this.getPreset(context.chainId);
    const page = await this.fetchOrdersPage(context.chainId, request);
    const descriptors = buildEkuboOrderDescriptors({
      chainId: context.chainId,
      positions: preset.positions,
      positionsNft: preset.positionsNft,
      page,
    });
    const infos = await this.getOrderInfos(
      context,
      descriptors.map((item) => item.parsedOrderId)
    );
    const nowSeconds = await this.getCurrentBlockTimestamp(context);

    const content = descriptors.map((descriptor, index) =>
      toEkuboDcaOrder({
        descriptor,
        info: infos[index]!,
        traderAddress: request.traderAddress,
        providerId: this.id,
        nowSeconds,
      })
    );

    return {
      content,
      totalPages: page.pagination.totalPages,
      totalElements: page.pagination.totalItems,
      size: page.pagination.pageSize,
      pageNumber: page.pagination.page - 1,
    };
  }

  async prepareCreate(
    context: DcaProviderContext,
    request: DcaCreateRequest
  ): Promise<PreparedDcaAction> {
    validateCreateRequest(request);

    const preset = this.getPreset(context.chainId);
    const fee = await this.resolvePoolFee(context.chainId, request, preset);
    const now = await this.getCurrentBlockTimestamp(context);
    const startTime = alignEkuboTime(now, now + MINIMUM_START_DELAY_SECONDS);
    const sellAmountBase = request.sellAmount.toBase();
    const sellAmountPerCycleBase = request.sellAmountPerCycle.toBase();
    const cycleCount =
      (sellAmountBase + sellAmountPerCycleBase - 1n) / sellAmountPerCycleBase;
    const cycleSeconds = BigInt(parseIsoDurationSeconds(request.frequency));
    const durationSeconds = cycleCount * cycleSeconds;

    if (durationSeconds <= 0n || durationSeconds > MAX_U32) {
      throw new Error("Ekubo DCA total duration must fit in u32 seconds");
    }

    const endTime = alignEkuboTime(now, startTime + Number(durationSeconds));
    const calls = this.buildCreateCalls({
      positions: preset.positions,
      sellToken: request.sellToken.address,
      buyToken: request.buyToken.address,
      sellAmountBase,
      fee,
      startTime,
      endTime,
    });

    return {
      providerId: this.id,
      action: "create",
      calls,
      orderAddress: preset.positions,
    };
  }

  async prepareCancel(
    context: DcaProviderContext,
    request: DcaCancelRequest
  ): Promise<PreparedDcaAction> {
    if (!request.orderId) {
      throw new Error("Ekubo DCA cancel requires an orderId from getOrders()");
    }

    const preset = this.getPreset(context.chainId);
    const order = decodeEkuboOrderId(request.orderId);
    if (order.positions !== preset.positions) {
      throw new Error(
        "Ekubo DCA orderId does not match the positions contract for the current chain"
      );
    }

    const info = await this.getOrderInfo(context, order);
    const calls = this.buildCancelCalls(order, info);
    if (calls.length === 0) {
      throw new Error("Ekubo DCA order is already fully settled");
    }

    return {
      providerId: this.id,
      action: "cancel",
      calls,
      orderId: request.orderId,
      orderAddress: order.positions,
    };
  }

  private getPreset(chainId: ChainId): EkuboDcaConfig {
    return this.presets[getEkuboChainLiteral(chainId, "DCA")];
  }

  private async fetchOrdersPage(
    chainId: ChainId,
    request: DcaOrdersRequest
  ): Promise<EkuboApiOrdersResponse> {
    const params = new URLSearchParams({
      chainId: toEkuboApiChainId(chainId),
      page: String((request.page ?? 0) + 1),
      pageSize: String(request.size ?? 50),
    });

    if (request.status === "ACTIVE") {
      params.set("state", "opened");
    } else if (request.status === "CLOSED") {
      params.set("state", "closed");
    }

    return parseEkuboOrdersResponse(
      await this.fetchJson(
        `/twap/orders/${request.traderAddress}?${params.toString()}`,
        "TWAP orders"
      )
    );
  }

  private async resolvePoolFee(
    chainId: ChainId,
    request: DcaCreateRequest,
    preset: EkuboDcaConfig
  ): Promise<bigint> {
    const minTvlUsdParam =
      this.minTvlUsd > 0 ? `?minTvlUsd=${this.minTvlUsd}` : "";
    const poolsPath = `/pair/${toEkuboApiChainId(chainId)}/${request.sellToken.address}/${request.buyToken.address}/pools${minTvlUsdParam}`;

    try {
      return pickTwammPoolFee(
        parseEkuboPoolsResponse(await this.fetchJson(poolsPath, "pair pools")),
        preset.twammExtension
      );
    } catch (error) {
      try {
        return await this.resolvePoolFeeFromQuote(chainId, request, preset);
      } catch (quoteError) {
        if (preset.fallbackTwammPoolFee != null) {
          return preset.fallbackTwammPoolFee;
        }

        const baseMessage =
          error instanceof Error ? error.message : String(error);
        const quoteMessage =
          quoteError instanceof Error ? quoteError.message : String(quoteError);
        throw new Error(
          `${baseMessage}; quote fallback also failed: ${quoteMessage}`
        );
      }
    }
  }

  private async resolvePoolFeeFromQuote(
    chainId: ChainId,
    request: DcaCreateRequest,
    preset: EkuboDcaConfig
  ): Promise<bigint> {
    const amountInBase = request.sellAmountPerCycle.toBase();
    const quotePath = `/${getEkuboQuoterChainId(chainId)}/${amountInBase.toString()}/${request.sellToken.address}/${request.buyToken.address}`;
    const quote = parseEkuboQuoteResponse(
      await this.fetchJson(quotePath, "quote fallback", this.quoteApiBase)
    );

    for (const split of quote.splits) {
      for (const step of split.route) {
        const extension = fromAddress(step.pool_key.extension);
        const token0 = fromAddress(step.pool_key.token0);
        const token1 = fromAddress(step.pool_key.token1);
        const isExactPair =
          (token0 === request.sellToken.address &&
            token1 === request.buyToken.address) ||
          (token0 === request.buyToken.address &&
            token1 === request.sellToken.address);

        if (extension === preset.twammExtension && isExactPair) {
          return BigInt(step.pool_key.fee);
        }
      }
    }

    throw new Error(
      "Ekubo quote fallback did not include an exact TWAMM-enabled pool for this pair"
    );
  }

  private buildCreateCalls(params: {
    positions: Address;
    sellToken: Address;
    buyToken: Address;
    sellAmountBase: bigint;
    fee: bigint;
    startTime: number;
    endTime: number;
  }): Call[] {
    return [
      {
        contractAddress: params.sellToken,
        entrypoint: "transfer",
        calldata: CallData.compile({
          recipient: params.positions,
          amount: cairo.uint256(params.sellAmountBase),
        }),
      },
      {
        contractAddress: params.positions,
        entrypoint: "mint_and_increase_sell_amount",
        calldata: [
          params.sellToken,
          params.buyToken,
          params.fee.toString(),
          params.startTime.toString(),
          params.endTime.toString(),
          params.sellAmountBase.toString(),
        ],
      },
      {
        contractAddress: params.positions,
        entrypoint: "clear",
        calldata: [params.sellToken],
      },
    ];
  }

  private buildCancelCalls(
    order: ParsedEkuboOrderId,
    info: EkuboOnChainOrderInfo
  ): Call[] {
    const orderCalldata = toOrderInfoCalldata(order);
    const calls: Call[] = [];

    if (info.purchasedAmount > 0n) {
      calls.push({
        contractAddress: order.positions,
        entrypoint: "withdraw_proceeds_from_sale_to_self",
        calldata: orderCalldata,
      });
    }

    if (info.saleRate > 0n) {
      calls.push({
        contractAddress: order.positions,
        entrypoint: "decrease_sale_rate_to_self",
        calldata: [...orderCalldata, info.saleRate.toString()],
      });
    }

    return calls;
  }

  private async getCurrentBlockTimestamp(
    context: DcaProviderContext
  ): Promise<number> {
    const latestBlock = await context.rpcProvider.getBlock("latest");
    const timestamp = latestBlock.timestamp;
    assertNonNegativeInteger(timestamp, "latest block timestamp");
    return timestamp;
  }

  private async fetchJson(
    path: string,
    requestLabel: string,
    apiBase = this.apiBase
  ): Promise<unknown> {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutHandle = controller
      ? setTimeout(() => controller.abort(), DEFAULT_EKUBO_REQUEST_TIMEOUT_MS)
      : null;

    try {
      const response = await this.fetcher(
        `${apiBase}${path}`,
        controller ? { signal: controller.signal } : undefined
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage = getEkuboErrorMessageFromPayload(payload);
        const errorSuffix = errorMessage ? `: ${errorMessage}` : "";
        throw new Error(
          `Ekubo ${requestLabel} request failed (${response.status})${errorSuffix}`
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Ekubo ${requestLabel} request timed out after ${DEFAULT_EKUBO_REQUEST_TIMEOUT_MS}ms`
        );
      }

      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async getOrderInfos(
    context: DcaProviderContext,
    orders: ParsedEkuboOrderId[]
  ): Promise<EkuboOnChainOrderInfo[]> {
    if (orders.length === 0) {
      return [];
    }

    const firstPositions = orders[0]!.positions;
    if (!orders.every((order) => order.positions === firstPositions)) {
      throw new Error("Ekubo order batch spans multiple positions contracts");
    }

    const result = await context.rpcProvider.callContract({
      contractAddress: firstPositions,
      entrypoint: "get_orders_info",
      calldata: [
        orders.length.toString(),
        ...orders.flatMap((order) => toOrderInfoCalldata(order)),
      ],
    });

    return parseOrderInfosResult(result as string[], orders.length);
  }

  private async getOrderInfo(
    context: DcaProviderContext,
    order: ParsedEkuboOrderId
  ): Promise<EkuboOnChainOrderInfo> {
    const result = await context.rpcProvider.callContract({
      contractAddress: order.positions,
      entrypoint: "get_order_info",
      calldata: toOrderInfoCalldata(order),
    });

    return parseOrderInfoResult(result as string[]);
  }
}
