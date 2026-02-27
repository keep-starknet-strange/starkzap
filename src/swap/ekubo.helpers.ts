import type { ChainId, Token } from "@/types";
import type { SwapQuote } from "@/swap/interface";
import { CallData, cairo, type Call } from "starknet";

export const DEFAULT_EKUBO_API_BASE = "https://prod-api-quoter.ekubo.org";

const EKUBO_QUOTER_CHAIN_IDS = {
  SN_MAIN: "23448594291968334",
  SN_SEPOLIA: "393402133025997798000961",
} as const;
const MAX_U128 = 2n ** 128n - 1n;
const DEFAULT_SLIPPAGE_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;

interface EkuboPoolKey {
  token0: string;
  token1: string;
  fee: string;
  tick_spacing: string | number;
  extension: string;
}

interface EkuboRouteStep {
  pool_key: EkuboPoolKey;
  sqrt_ratio_limit: string;
  skip_ahead: string | number;
}

interface EkuboQuoteSplit {
  amount_specified: string;
  amount_calculated: string;
  route: EkuboRouteStep[];
}

export interface EkuboQuoteResponse {
  total_calculated: string;
  price_impact: number | null;
  splits: EkuboQuoteSplit[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getEkuboErrorMessageFromPayload(
  payload: unknown
): string | null {
  if (!isObjectRecord(payload)) {
    return null;
  }
  return typeof payload.error === "string" ? payload.error : null;
}

export function getEkuboQuoterChainId(chainId: ChainId): string {
  const literal = chainId.toLiteral();
  if (literal === "SN_MAIN") {
    return EKUBO_QUOTER_CHAIN_IDS.SN_MAIN;
  }
  if (literal === "SN_SEPOLIA") {
    return EKUBO_QUOTER_CHAIN_IDS.SN_SEPOLIA;
  }
  throw new Error(`Unsupported chain for Ekubo quote: ${literal}`);
}

function parseNonNegativeBigInt(
  value: string | number | bigint,
  label: string
): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  if (parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
  return parsed;
}

function toI129(value: bigint): { mag: bigint; sign: boolean } {
  const magnitude = value < 0n ? value * -1n : value;
  if (magnitude > MAX_U128) {
    throw new Error("Value exceeds i129 magnitude range");
  }
  return { mag: magnitude, sign: value < 0n };
}

function toPoolKeyCalldata(poolKey: EkuboPoolKey): {
  token0: string;
  token1: string;
  fee: bigint;
  tick_spacing: bigint;
  extension: bigint;
} {
  return {
    token0: poolKey.token0,
    token1: poolKey.token1,
    fee: parseNonNegativeBigInt(poolKey.fee, "pool fee"),
    tick_spacing: parseNonNegativeBigInt(
      poolKey.tick_spacing,
      "pool tick spacing"
    ),
    extension: parseNonNegativeBigInt(poolKey.extension, "pool extension"),
  };
}

function toRouteStepCalldata(step: EkuboRouteStep): {
  pool_key: ReturnType<typeof toPoolKeyCalldata>;
  sqrt_ratio_limit: ReturnType<typeof cairo.uint256>;
  skip_ahead: bigint;
} {
  return {
    pool_key: toPoolKeyCalldata(step.pool_key),
    sqrt_ratio_limit: cairo.uint256(
      parseNonNegativeBigInt(step.sqrt_ratio_limit, "sqrt_ratio_limit")
    ),
    skip_ahead: parseNonNegativeBigInt(step.skip_ahead, "skip_ahead"),
  };
}

function assertRouteTokenSequence(
  route: EkuboRouteStep[],
  sourceToken: string
): void {
  let currentToken = BigInt(sourceToken);
  for (const step of route) {
    const token0 = BigInt(step.pool_key.token0);
    const token1 = BigInt(step.pool_key.token1);
    if (currentToken !== token0 && currentToken !== token1) {
      throw new Error("Quote route token sequence is invalid");
    }
    currentToken = currentToken === token1 ? token0 : token1;
  }
}

function percentToBps(value: number | null): bigint | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return BigInt(Math.round(value * 100));
}

export function parseEkuboQuoteResponse(payload: unknown): EkuboQuoteResponse {
  if (!isObjectRecord(payload)) {
    throw new Error("Ekubo quote response is malformed");
  }

  const responseError = getEkuboErrorMessageFromPayload(payload);
  if (responseError) {
    throw new Error(responseError);
  }

  const totalCalculated = payload.total_calculated;
  const splitsRaw = payload.splits;
  if (typeof totalCalculated !== "string" || !Array.isArray(splitsRaw)) {
    throw new Error("Ekubo quote response is missing required fields");
  }

  const priceImpact = payload.price_impact;
  if (
    priceImpact !== null &&
    priceImpact !== undefined &&
    typeof priceImpact !== "number"
  ) {
    throw new Error("Ekubo quote response contains an invalid price impact");
  }

  const splits = splitsRaw.map((split): EkuboQuoteSplit => {
    if (!isObjectRecord(split) || !Array.isArray(split.route)) {
      throw new Error("Ekubo split is malformed");
    }
    if (
      typeof split.amount_specified !== "string" ||
      typeof split.amount_calculated !== "string"
    ) {
      throw new Error("Ekubo split is missing required fields");
    }

    const route = split.route.map((step): EkuboRouteStep => {
      if (!isObjectRecord(step) || !isObjectRecord(step.pool_key)) {
        throw new Error("Ekubo route step is malformed");
      }
      const poolKey = step.pool_key;
      if (
        typeof poolKey.token0 !== "string" ||
        typeof poolKey.token1 !== "string" ||
        typeof poolKey.fee !== "string" ||
        (typeof poolKey.tick_spacing !== "string" &&
          typeof poolKey.tick_spacing !== "number") ||
        typeof poolKey.extension !== "string" ||
        typeof step.sqrt_ratio_limit !== "string" ||
        (typeof step.skip_ahead !== "string" &&
          typeof step.skip_ahead !== "number")
      ) {
        throw new Error("Ekubo route step is invalid");
      }

      return {
        pool_key: {
          token0: poolKey.token0,
          token1: poolKey.token1,
          fee: poolKey.fee,
          tick_spacing: poolKey.tick_spacing,
          extension: poolKey.extension,
        },
        sqrt_ratio_limit: step.sqrt_ratio_limit,
        skip_ahead: step.skip_ahead,
      };
    });

    return {
      amount_specified: split.amount_specified,
      amount_calculated: split.amount_calculated,
      route,
    };
  });

  return {
    total_calculated: totalCalculated,
    price_impact: priceImpact ?? null,
    splits,
  };
}

export function buildEkuboSwapCalls(params: {
  quote: EkuboQuoteResponse;
  tokenIn: Token;
  tokenOut: Token;
  amountInBase: bigint;
  extensionRouter: string;
  slippageBps?: bigint;
}): Call[] {
  const { quote, tokenIn, tokenOut, amountInBase, extensionRouter } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (slippageBps < 0n || slippageBps >= BPS_DENOMINATOR) {
    throw new Error("Invalid slippage bps");
  }
  if (!quote.splits.length) {
    throw new Error("Ekubo quote returned no routes");
  }

  const totalCalculated = BigInt(quote.total_calculated);
  if (totalCalculated <= 0n) {
    throw new Error("Ekubo quote returned zero output");
  }

  const minimumOut =
    (totalCalculated * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR;
  if (minimumOut <= 0n) {
    throw new Error("Calculated minimum output is zero");
  }

  const sourceToken = tokenIn.address;
  const firstSplit = quote.splits[0]!;
  if (!firstSplit.route.length) {
    throw new Error("Ekubo quote route is empty");
  }

  let swapCall: Call;
  if (quote.splits.length === 1 && firstSplit.route.length === 1) {
    const singleStep = firstSplit.route[0]!;
    swapCall = {
      contractAddress: extensionRouter,
      entrypoint: "swap",
      calldata: CallData.compile({
        pool_key: toPoolKeyCalldata(singleStep.pool_key),
        sqrt_ratio_limit: cairo.uint256(
          parseNonNegativeBigInt(
            singleStep.sqrt_ratio_limit,
            "single-route sqrt_ratio_limit"
          )
        ),
        skip_ahead: parseNonNegativeBigInt(
          singleStep.skip_ahead,
          "single-route skip_ahead"
        ),
        token: sourceToken,
        amount: toI129(amountInBase),
      }),
    };
  } else if (quote.splits.length === 1) {
    assertRouteTokenSequence(firstSplit.route, sourceToken);
    swapCall = {
      contractAddress: extensionRouter,
      entrypoint: "multihop_swap",
      calldata: CallData.compile({
        route: firstSplit.route.map(toRouteStepCalldata),
        token: sourceToken,
        amount: toI129(BigInt(firstSplit.amount_specified)),
      }),
    };
  } else {
    const splitsCalldata = quote.splits.map((split) => {
      if (!split.route.length) {
        throw new Error("Ekubo quote split route is empty");
      }
      assertRouteTokenSequence(split.route, sourceToken);
      return {
        route: split.route.map(toRouteStepCalldata),
        token: sourceToken,
        amount: toI129(BigInt(split.amount_specified)),
      };
    });
    swapCall = {
      contractAddress: extensionRouter,
      entrypoint: "multi_multihop_swap",
      calldata: CallData.compile({
        splits: splitsCalldata,
      }),
    };
  }

  return [
    {
      contractAddress: tokenIn.address,
      entrypoint: "transfer",
      calldata: CallData.compile({
        recipient: extensionRouter,
        amount: cairo.uint256(amountInBase),
      }),
    },
    swapCall,
    {
      contractAddress: extensionRouter,
      entrypoint: "clear_minimum",
      calldata: CallData.compile({
        token: tokenOut.address,
        amount: cairo.uint256(minimumOut),
      }),
    },
    {
      contractAddress: extensionRouter,
      entrypoint: "clear",
      calldata: CallData.compile({
        token: tokenIn.address,
      }),
    },
  ];
}

export function toEkuboSwapQuote(params: {
  quote: EkuboQuoteResponse;
  amountInBase: bigint;
  routeCallCount?: number;
}): SwapQuote {
  const quote: SwapQuote = {
    amountInBase: params.amountInBase,
    amountOutBase: BigInt(params.quote.total_calculated),
    priceImpactBps: percentToBps(params.quote.price_impact),
    provider: "ekubo",
  };
  if (params.routeCallCount != null) {
    quote.routeCallCount = params.routeCallCount;
  }
  return quote;
}
