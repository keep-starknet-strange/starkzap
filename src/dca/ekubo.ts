import { CallData, cairo, type Call } from "starknet";
import {
  assertAmountMatchesToken,
  fromAddress,
  type Address,
  type ChainId,
} from "@/types";
import type {
  DcaCancelRequest,
  DcaCreateRequest,
  DcaOrder,
  DcaOrdersPage,
  DcaOrdersRequest,
  DcaProvider,
  DcaProviderContext,
  PreparedDcaAction,
} from "@/dca/interface";

const DEFAULT_EKUBO_DCA_API_BASE = "https://prod-api.ekubo.org";
const EKUBO_TIME_SPACING_SECONDS = 16;
const MINIMUM_START_DELAY_SECONDS = 64;
const MAX_U128 = 2n ** 128n - 1n;
const MAX_U32 = 2n ** 32n - 1n;
const ORDER_ID_PREFIX = "ekubo-v1";

interface EkuboDcaConfig {
  positions: Address;
  positionsNft: Address;
  twammExtension: Address;
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

interface EkuboOrderKey {
  sellToken: Address;
  buyToken: Address;
  fee: bigint;
  startTime: number;
  endTime: number;
}

interface EkuboApiOrder {
  key: {
    sell_token: string;
    buy_token: string;
    fee: string;
    start_time: number;
    end_time: number;
  };
  total_proceeds_withdrawn: string;
  sale_rate: string;
  last_collect_proceeds: number | null;
  total_amount_sold: string;
}

interface EkuboApiOrderGroup {
  chain_id: string;
  nft_address: string;
  token_id: string;
  orders: EkuboApiOrder[];
}

interface EkuboApiOrdersResponse {
  orders: EkuboApiOrderGroup[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

interface EkuboApiPool {
  fee: string;
  extension: string;
}

interface EkuboApiPoolsResponse {
  topPools: EkuboApiPool[];
}

interface EkuboOnChainOrderInfo {
  saleRate: bigint;
  remainingSellAmount: bigint;
  purchasedAmount: bigint;
}

interface ParsedEkuboOrderId {
  positions: Address;
  tokenId: bigint;
  orderKey: EkuboOrderKey;
}

interface EkuboOrderDescriptor {
  apiOrder: EkuboApiOrder;
  orderId: string;
  parsedOrderId: ParsedEkuboOrderId;
}

export interface EkuboDcaProviderOptions {
  /** Optional Ekubo API base URL override. */
  apiBase?: string;
  /** Optional fetch implementation override for custom runtimes/tests. */
  fetcher?: typeof fetch;
  /** Optional minimum TVL filter passed to Ekubo pair-pools discovery. */
  minTvlUsd?: number;
  /** Optional chain-aware preset overrides. */
  presets?: Partial<Record<"SN_MAIN" | "SN_SEPOLIA", Partial<EkuboDcaConfig>>>;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertFitsU128(value: bigint, label: string): void {
  if (value < 0n || value > MAX_U128) {
    throw new Error(`${label} must fit in u128`);
  }
}

function toEkuboApiChainId(chainId: ChainId): string {
  return BigInt(chainId.toFelt252()).toString(10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePositiveBigInt(value: unknown, label: string): bigint {
  try {
    const parsed = BigInt(String(value));
    if (parsed < 0n) {
      throw new Error(`${label} cannot be negative`);
    }
    return parsed;
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}

function parseRequiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`Invalid ${label}`);
  }
  assertNonNegativeInteger(value, label);
  return value;
}

function parseEkuboOrdersResponse(payload: unknown): EkuboApiOrdersResponse {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.orders) ||
    !isRecord(payload.pagination)
  ) {
    throw new Error("Ekubo TWAP orders response is malformed");
  }

  const orders = payload.orders.map((group): EkuboApiOrderGroup => {
    if (!isRecord(group) || !Array.isArray(group.orders)) {
      throw new Error("Ekubo TWAP order group is malformed");
    }

    return {
      chain_id: String(group.chain_id),
      nft_address: String(group.nft_address),
      token_id: String(group.token_id),
      orders: group.orders.map((order): EkuboApiOrder => {
        if (!isRecord(order) || !isRecord(order.key)) {
          throw new Error("Ekubo TWAP order is malformed");
        }

        return {
          key: {
            sell_token: String(order.key.sell_token),
            buy_token: String(order.key.buy_token),
            fee: String(order.key.fee),
            start_time: parseRequiredNumber(order.key.start_time, "start_time"),
            end_time: parseRequiredNumber(order.key.end_time, "end_time"),
          },
          total_proceeds_withdrawn: String(order.total_proceeds_withdrawn),
          sale_rate: String(order.sale_rate),
          last_collect_proceeds:
            order.last_collect_proceeds == null
              ? null
              : parseRequiredNumber(
                  order.last_collect_proceeds,
                  "last_collect_proceeds"
                ),
          total_amount_sold: String(order.total_amount_sold),
        };
      }),
    };
  });

  const pagination = payload.pagination;
  return {
    orders,
    pagination: {
      page: parseRequiredNumber(pagination.page, "page"),
      pageSize: parseRequiredNumber(pagination.pageSize, "pageSize"),
      totalPages: parseRequiredNumber(pagination.totalPages, "totalPages"),
      totalItems: parseRequiredNumber(pagination.totalItems, "totalItems"),
    },
  };
}

function parseEkuboPoolsResponse(payload: unknown): EkuboApiPoolsResponse {
  if (!isRecord(payload) || !Array.isArray(payload.topPools)) {
    throw new Error("Ekubo pair pools response is malformed");
  }

  return {
    topPools: payload.topPools.map((pool): EkuboApiPool => {
      if (!isRecord(pool)) {
        throw new Error("Ekubo pair pool is malformed");
      }

      return {
        fee: String(pool.fee),
        extension: String(pool.extension),
      };
    }),
  };
}

function parseIsoDurationSeconds(value: string): number {
  const match =
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      value
    );
  if (!match) {
    throw new Error(`Unsupported DCA frequency: ${value}`);
  }

  const weeks = Number(match[1] ?? 0);
  const days = Number(match[2] ?? 0);
  const hours = Number(match[3] ?? 0);
  const minutes = Number(match[4] ?? 0);
  const seconds = Number(match[5] ?? 0);
  const totalSeconds =
    weeks * 7 * 24 * 60 * 60 +
    days * 24 * 60 * 60 +
    hours * 60 * 60 +
    minutes * 60 +
    seconds;

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    throw new Error(
      `DCA frequency must resolve to a positive duration: ${value}`
    );
  }

  return totalSeconds;
}

function getEkuboTimeStep(now: number, time: number): number {
  if (time <= now + EKUBO_TIME_SPACING_SECONDS) {
    return EKUBO_TIME_SPACING_SECONDS;
  }

  let step = EKUBO_TIME_SPACING_SECONDS;
  const delta = time - now;
  while (step * EKUBO_TIME_SPACING_SECONDS <= delta) {
    step *= EKUBO_TIME_SPACING_SECONDS;
  }
  return step;
}

function alignEkuboTime(now: number, target: number): number {
  let candidate = Math.max(
    target,
    now + EKUBO_TIME_SPACING_SECONDS,
    now + MINIMUM_START_DELAY_SECONDS
  );

  while (true) {
    const step = getEkuboTimeStep(now, candidate);
    const remainder = candidate % step;
    if (remainder === 0) {
      return candidate;
    }
    candidate += step - remainder;
  }
}

function encodeEkuboOrderId(params: {
  positions: Address;
  tokenId: bigint;
  orderKey: EkuboOrderKey;
}): string {
  return [
    ORDER_ID_PREFIX,
    params.positions,
    params.tokenId.toString(10),
    params.orderKey.sellToken,
    params.orderKey.buyToken,
    params.orderKey.fee.toString(10),
    params.orderKey.startTime.toString(10),
    params.orderKey.endTime.toString(10),
  ].join(":");
}

function decodeEkuboOrderId(orderId: string): ParsedEkuboOrderId {
  const parts = orderId.split(":");
  if (parts.length !== 8 || parts[0] !== ORDER_ID_PREFIX) {
    throw new Error(
      `Invalid Ekubo DCA order id "${orderId}". Expected ${ORDER_ID_PREFIX}:<positions>:<tokenId>:<sellToken>:<buyToken>:<fee>:<startTime>:<endTime>.`
    );
  }

  return {
    positions: fromAddress(parts[1]!),
    tokenId: parsePositiveBigInt(parts[2], "tokenId"),
    orderKey: {
      sellToken: fromAddress(parts[3]!),
      buyToken: fromAddress(parts[4]!),
      fee: parsePositiveBigInt(parts[5], "fee"),
      startTime: Number(parsePositiveBigInt(parts[6], "startTime")),
      endTime: Number(parsePositiveBigInt(parts[7], "endTime")),
    },
  };
}

function toOrderInfoCalldata(order: ParsedEkuboOrderId): string[] {
  return [
    order.tokenId.toString(),
    order.orderKey.sellToken,
    order.orderKey.buyToken,
    order.orderKey.fee.toString(),
    order.orderKey.startTime.toString(),
    order.orderKey.endTime.toString(),
  ];
}

function parseOrderInfoResult(result: string[]): EkuboOnChainOrderInfo {
  if (result.length < 3) {
    throw new Error("Ekubo order info response is malformed");
  }

  return {
    saleRate: parsePositiveBigInt(result[0], "sale_rate"),
    remainingSellAmount: parsePositiveBigInt(
      result[1],
      "remaining_sell_amount"
    ),
    purchasedAmount: parsePositiveBigInt(result[2], "purchased_amount"),
  };
}

function parseOrderInfosResult(
  result: string[],
  expected: number
): EkuboOnChainOrderInfo[] {
  const values = result.map((item) => String(item));
  const explicitLength =
    values.length === expected * 3 + 1 ? Number(values[0]) : null;
  const offset = explicitLength == null ? 0 : 1;

  if (
    (explicitLength != null && explicitLength !== expected) ||
    values.length !== expected * 3 + offset
  ) {
    throw new Error("Ekubo order infos response is malformed");
  }

  const infos: EkuboOnChainOrderInfo[] = [];
  for (let index = 0; index < expected; index += 1) {
    const baseIndex = offset + index * 3;
    infos.push(
      parseOrderInfoResult(values.slice(baseIndex, baseIndex + 3) as string[])
    );
  }
  return infos;
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
  if (request.pricingStrategy) {
    throw new Error("Ekubo DCA does not support pricingStrategy constraints");
  }

  assertFitsU128(request.sellAmount.toBase(), "Ekubo DCA sellAmount");
}

function pickTwammPoolFee(
  payload: EkuboApiPoolsResponse,
  twammExtension: Address
): bigint {
  const matchingPool = payload.topPools.find(
    (pool) => fromAddress(pool.extension) === twammExtension
  );
  if (!matchingPool) {
    throw new Error("Ekubo did not return a TWAMM-enabled pool for this pair");
  }
  return parsePositiveBigInt(matchingPool.fee, "pool fee");
}

export function getEkuboDcaPreset(chainId: ChainId): EkuboDcaConfig {
  const literal = chainId.toLiteral();
  if (literal === "SN_MAIN") {
    return ekuboDcaPresets.SN_MAIN;
  }
  if (literal === "SN_SEPOLIA") {
    return ekuboDcaPresets.SN_SEPOLIA;
  }
  throw new Error(`Unsupported chain for Ekubo DCA: ${literal}`);
}

export class EkuboDcaProvider implements DcaProvider {
  readonly id = "ekubo";

  private readonly apiBase: string;
  private readonly fetcher: typeof fetch;
  private readonly minTvlUsd: number;
  private readonly presets: Record<"SN_MAIN" | "SN_SEPOLIA", EkuboDcaConfig>;

  constructor(options: EkuboDcaProviderOptions = {}) {
    this.apiBase = options.apiBase ?? DEFAULT_EKUBO_DCA_API_BASE;
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
    const literal = chainId.toLiteral();
    return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
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
        number: request.page ?? 0,
      };
    }

    const preset = this.getPreset(context.chainId);
    const page = await this.fetchOrdersPage(context.chainId, request);
    const currentChainId = toEkuboApiChainId(context.chainId).toLowerCase();
    const descriptors: EkuboOrderDescriptor[] = [];

    for (const group of page.orders) {
      if (
        group.chain_id.toLowerCase() !== currentChainId ||
        fromAddress(group.nft_address) !== preset.positionsNft
      ) {
        continue;
      }

      const tokenId = parsePositiveBigInt(group.token_id, "token_id");
      for (const apiOrder of group.orders) {
        const parsedOrderId = {
          positions: preset.positions,
          tokenId,
          orderKey: {
            sellToken: fromAddress(apiOrder.key.sell_token),
            buyToken: fromAddress(apiOrder.key.buy_token),
            fee: parsePositiveBigInt(apiOrder.key.fee, "fee"),
            startTime: apiOrder.key.start_time,
            endTime: apiOrder.key.end_time,
          },
        };

        descriptors.push({
          apiOrder,
          orderId: encodeEkuboOrderId(parsedOrderId),
          parsedOrderId,
        });
      }
    }

    const infos = await this.getOrderInfos(
      context,
      descriptors.map((item) => item.parsedOrderId)
    );
    const nowSeconds = Math.floor(Date.now() / 1000);

    const content = descriptors.map(
      ({ apiOrder, orderId, parsedOrderId }, index): DcaOrder => {
        const info = infos[index]!;
        const totalAmountSold = parsePositiveBigInt(
          apiOrder.total_amount_sold,
          "total_amount_sold"
        );
        const proceedsWithdrawn = parsePositiveBigInt(
          apiOrder.total_proceeds_withdrawn,
          "total_proceeds_withdrawn"
        );
        const sellAmountBase = totalAmountSold + info.remainingSellAmount;
        const amountBoughtBase = proceedsWithdrawn + info.purchasedAmount;
        const startDate = new Date(parsedOrderId.orderKey.startTime * 1000);
        const endDate = new Date(parsedOrderId.orderKey.endTime * 1000);
        const status =
          info.saleRate === 0n || nowSeconds >= parsedOrderId.orderKey.endTime
            ? "CLOSED"
            : "ACTIVE";

        return {
          id: orderId,
          providerId: this.id,
          blockNumber: 0,
          timestamp: startDate,
          traderAddress: request.traderAddress,
          orderAddress: preset.positions,
          creationTransactionHash: "",
          orderClassHash: "",
          sellTokenAddress: parsedOrderId.orderKey.sellToken,
          sellAmountBase,
          sellAmountPerCycleBase: sellAmountBase,
          buyTokenAddress: parsedOrderId.orderKey.buyToken,
          startDate,
          endDate,
          ...(status === "CLOSED" && { closeDate: endDate }),
          frequency: "CONTINUOUS",
          iterations: 1,
          status,
          pricingStrategy: {},
          amountSoldBase: totalAmountSold,
          amountBoughtBase,
          averageAmountBoughtBase: amountBoughtBase,
          executedTradesCount: totalAmountSold > 0n ? 1 : 0,
          cancelledTradesCount: 0,
          pendingTradesCount: status === "ACTIVE" ? 1 : 0,
          trades: [],
        };
      }
    );

    return {
      content,
      totalPages: page.pagination.totalPages,
      totalElements: page.pagination.totalItems,
      size: page.pagination.pageSize,
      number: page.pagination.page - 1,
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

    const order = decodeEkuboOrderId(request.orderId);
    const info = await this.getOrderInfo(context, order);
    const calls: Call[] = [];

    if (info.purchasedAmount > 0n) {
      calls.push({
        contractAddress: order.positions,
        entrypoint: "withdraw_proceeds_from_sale_to_self",
        calldata: toOrderInfoCalldata(order),
      });
    }

    if (info.saleRate > 0n) {
      calls.push({
        contractAddress: order.positions,
        entrypoint: "decrease_sale_rate_to_self",
        calldata: [...toOrderInfoCalldata(order), info.saleRate.toString()],
      });
    }

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
    const literal = chainId.toLiteral();
    if (literal === "SN_MAIN") {
      return this.presets.SN_MAIN;
    }
    if (literal === "SN_SEPOLIA") {
      return this.presets.SN_SEPOLIA;
    }
    throw new Error(`Unsupported chain for Ekubo DCA: ${literal}`);
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
    return pickTwammPoolFee(
      parseEkuboPoolsResponse(
        await this.fetchJson(
          `/pair/${toEkuboApiChainId(chainId)}/${request.sellToken.address}/${request.buyToken.address}/pools${minTvlUsdParam}`,
          "pair pools"
        )
      ),
      preset.twammExtension
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

  private async getCurrentBlockTimestamp(
    context: DcaProviderContext
  ): Promise<number> {
    const latestBlock = await context.provider.getBlock("latest");
    const timestamp = latestBlock.timestamp;
    assertNonNegativeInteger(timestamp, "latest block timestamp");
    return timestamp;
  }

  private async fetchJson(
    path: string,
    requestLabel: string
  ): Promise<unknown> {
    const response = await this.fetcher(`${this.apiBase}${path}`);
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorSuffix =
        isRecord(payload) && typeof payload.error === "string"
          ? `: ${payload.error}`
          : "";
      throw new Error(
        `Ekubo ${requestLabel} request failed (${response.status})${errorSuffix}`
      );
    }

    return payload;
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

    const result = await context.provider.callContract({
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
    const result = await context.provider.callContract({
      contractAddress: order.positions,
      entrypoint: "get_order_info",
      calldata: toOrderInfoCalldata(order),
    });

    return parseOrderInfoResult(result as string[]);
  }
}
