import { fromAddress, type Address, type ChainId } from "@/types";
import {
  DCA_CONTINUOUS_FREQUENCY,
  type DcaOrder,
  type DcaOrderStatus,
} from "@/dca/interface";
import { isRecord } from "@/utils/ekubo";

export const DEFAULT_EKUBO_DCA_API_BASE = "https://prod-api.ekubo.org";
export const MINIMUM_START_DELAY_SECONDS = 64;

const EKUBO_TIME_SPACING_SECONDS = 16;
const MAX_U128 = 2n ** 128n - 1n;
const ORDER_ID_PREFIX = "ekubo-v1";

export interface EkuboOrderKey {
  sellToken: Address;
  buyToken: Address;
  fee: bigint;
  startTime: number;
  endTime: number;
}

export interface EkuboApiOrder {
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

export interface EkuboApiOrderGroup {
  chain_id: string;
  nft_address: string;
  token_id: string;
  orders: EkuboApiOrder[];
}

export interface EkuboApiOrdersResponse {
  orders: EkuboApiOrderGroup[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface EkuboApiPool {
  fee: string;
  extension: string;
}

export interface EkuboApiPoolsResponse {
  topPools: EkuboApiPool[];
}

export interface EkuboOnChainOrderInfo {
  saleRate: bigint;
  remainingSellAmount: bigint;
  purchasedAmount: bigint;
}

export interface ParsedEkuboOrderId {
  positions: Address;
  tokenId: bigint;
  orderKey: EkuboOrderKey;
}

export interface EkuboOrderDescriptor {
  apiOrder: EkuboApiOrder;
  orderId: string;
  parsedOrderId: ParsedEkuboOrderId;
}

function parseRequiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`Invalid ${label}`);
  }

  assertNonNegativeInteger(value, label);
  return value;
}

function parseRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }

  return value;
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

function getEkuboOrderStatus(params: {
  parsedOrderId: ParsedEkuboOrderId;
  info: EkuboOnChainOrderInfo;
  nowSeconds: number;
}): DcaOrderStatus {
  if (params.info.saleRate === 0n) {
    return "CLOSED";
  }

  if (params.nowSeconds >= params.parsedOrderId.orderKey.endTime) {
    return "CLOSED";
  }

  return "ACTIVE";
}

export function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export function assertFitsU128(value: bigint, label: string): void {
  if (value < 0n || value > MAX_U128) {
    throw new Error(`${label} must fit in u128`);
  }
}

export function toEkuboApiChainId(chainId: ChainId): string {
  return BigInt(chainId.toFelt252()).toString(10);
}

export function parsePositiveBigInt(value: unknown, label: string): bigint {
  let parsed: bigint;

  try {
    parsed = BigInt(String(value));
  } catch {
    throw new Error(`Invalid ${label}`);
  }

  if (parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }

  return parsed;
}

export function parseEkuboOrdersResponse(
  payload: unknown
): EkuboApiOrdersResponse {
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
      chain_id: parseRequiredString(group.chain_id, "chain_id"),
      nft_address: parseRequiredString(group.nft_address, "nft_address"),
      token_id: parseRequiredString(group.token_id, "token_id"),
      orders: group.orders.map((order): EkuboApiOrder => {
        if (!isRecord(order) || !isRecord(order.key)) {
          throw new Error("Ekubo TWAP order is malformed");
        }

        return {
          key: {
            sell_token: parseRequiredString(order.key.sell_token, "sell_token"),
            buy_token: parseRequiredString(order.key.buy_token, "buy_token"),
            fee: parseRequiredString(order.key.fee, "fee"),
            start_time: parseRequiredNumber(order.key.start_time, "start_time"),
            end_time: parseRequiredNumber(order.key.end_time, "end_time"),
          },
          total_proceeds_withdrawn: parseRequiredString(
            order.total_proceeds_withdrawn,
            "total_proceeds_withdrawn"
          ),
          sale_rate: parseRequiredString(order.sale_rate, "sale_rate"),
          last_collect_proceeds:
            order.last_collect_proceeds == null
              ? null
              : parseRequiredNumber(
                  order.last_collect_proceeds,
                  "last_collect_proceeds"
                ),
          total_amount_sold: parseRequiredString(
            order.total_amount_sold,
            "total_amount_sold"
          ),
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

export function parseEkuboPoolsResponse(
  payload: unknown
): EkuboApiPoolsResponse {
  if (!isRecord(payload) || !Array.isArray(payload.topPools)) {
    throw new Error("Ekubo pair pools response is malformed");
  }

  return {
    topPools: payload.topPools.map((pool): EkuboApiPool => {
      if (!isRecord(pool)) {
        throw new Error("Ekubo pair pool is malformed");
      }

      return {
        fee: parseRequiredString(pool.fee, "fee"),
        extension: parseRequiredString(pool.extension, "extension"),
      };
    }),
  };
}

export function parseIsoDurationSeconds(value: string): number {
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

export function alignEkuboTime(now: number, target: number): number {
  let candidate = Math.max(
    target,
    now + EKUBO_TIME_SPACING_SECONDS,
    now + MINIMUM_START_DELAY_SECONDS
  );

  const MAX_ALIGNMENT_ITERATIONS = 100;
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_ALIGNMENT_ITERATIONS) {
      throw new Error("Ekubo time alignment failed to converge");
    }

    const step = getEkuboTimeStep(now, candidate);
    const remainder = candidate % step;
    if (remainder === 0) {
      return candidate;
    }

    candidate += step - remainder;
  }
}

export function encodeEkuboOrderId(params: {
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

export function decodeEkuboOrderId(orderId: string): ParsedEkuboOrderId {
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

export function toOrderInfoCalldata(order: ParsedEkuboOrderId): string[] {
  return [
    order.tokenId.toString(),
    order.orderKey.sellToken,
    order.orderKey.buyToken,
    order.orderKey.fee.toString(),
    order.orderKey.startTime.toString(),
    order.orderKey.endTime.toString(),
  ];
}

export function parseOrderInfoResult(result: string[]): EkuboOnChainOrderInfo {
  if (result.length !== 3) {
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

/**
 * Parse the result of `get_orders_info`.
 *
 * The on-chain response always includes a leading array-length prefix followed
 * by 3 felt252 values per order (saleRate, remainingSellAmount, purchasedAmount).
 * Total expected length: `expected * 3 + 1`.
 */
export function parseOrderInfosResult(
  result: string[],
  expected: number
): EkuboOnChainOrderInfo[] {
  const values = result.map((item) => String(item));
  const expectedLength = expected * 3 + 1;

  if (values.length !== expectedLength) {
    throw new Error(
      `Ekubo order infos response is malformed: expected ${expectedLength} values, got ${values.length}`
    );
  }

  const declaredLength = Number(values[0]);
  if (declaredLength !== expected) {
    throw new Error(
      `Ekubo order infos length mismatch: header says ${declaredLength}, expected ${expected}`
    );
  }

  const infos: EkuboOnChainOrderInfo[] = [];
  for (let index = 0; index < expected; index += 1) {
    const baseIndex = 1 + index * 3;
    infos.push(parseOrderInfoResult(values.slice(baseIndex, baseIndex + 3)));
  }

  return infos;
}

export function pickTwammPoolFee(
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

export function buildEkuboOrderDescriptors(params: {
  chainId: ChainId;
  positions: Address;
  positionsNft: Address;
  page: EkuboApiOrdersResponse;
}): EkuboOrderDescriptor[] {
  const currentChainId = toEkuboApiChainId(params.chainId).toLowerCase();
  const descriptors: EkuboOrderDescriptor[] = [];

  for (const group of params.page.orders) {
    if (group.chain_id.toLowerCase() !== currentChainId) {
      continue;
    }

    if (fromAddress(group.nft_address) !== params.positionsNft) {
      continue;
    }

    const tokenId = parsePositiveBigInt(group.token_id, "token_id");
    for (const apiOrder of group.orders) {
      const parsedOrderId: ParsedEkuboOrderId = {
        positions: params.positions,
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

  return descriptors;
}

export function toEkuboDcaOrder(params: {
  descriptor: EkuboOrderDescriptor;
  info: EkuboOnChainOrderInfo;
  traderAddress: Address;
  providerId: string;
  nowSeconds: number;
}): DcaOrder {
  const { apiOrder, orderId, parsedOrderId } = params.descriptor;
  const totalAmountSold = parsePositiveBigInt(
    apiOrder.total_amount_sold,
    "total_amount_sold"
  );
  const proceedsWithdrawn = parsePositiveBigInt(
    apiOrder.total_proceeds_withdrawn,
    "total_proceeds_withdrawn"
  );
  const sellAmountBase = totalAmountSold + params.info.remainingSellAmount;
  const amountBoughtBase = proceedsWithdrawn + params.info.purchasedAmount;
  const startDate = new Date(parsedOrderId.orderKey.startTime * 1000);
  const endDate = new Date(parsedOrderId.orderKey.endTime * 1000);
  const status = getEkuboOrderStatus({
    parsedOrderId,
    info: params.info,
    nowSeconds: params.nowSeconds,
  });

  const order: DcaOrder = {
    id: orderId,
    providerId: params.providerId,
    timestamp: startDate,
    traderAddress: params.traderAddress,
    orderAddress: parsedOrderId.positions,
    sellTokenAddress: parsedOrderId.orderKey.sellToken,
    sellAmountBase,
    buyTokenAddress: parsedOrderId.orderKey.buyToken,
    startDate,
    endDate,
    frequency: DCA_CONTINUOUS_FREQUENCY,
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

  if (status === "CLOSED") {
    order.closeDate = new Date(
      Math.min(parsedOrderId.orderKey.endTime, params.nowSeconds) * 1000
    );
  }

  return order;
}
