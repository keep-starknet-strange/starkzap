import { getEkuboPreset, type Call, type ChainId, type Token } from "starkzap";
import type {
  PrepareSwapParams,
  SwapExecution,
  SwapIntegration,
  SwapIntegrationContext,
  SwapIntegrationPairContext,
} from "@/swaps/interface";

const EKUBO_QUOTER_API_BASE = "https://prod-api-quoter.ekubo.org";
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

interface EkuboQuoteResponse {
  total_calculated: string;
  price_impact: number | null;
  splits: EkuboQuoteSplit[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dedupeAndSortTokens(tokens: Token[]): Token[] {
  const uniqueByAddress = new Map<string, Token>();
  for (const token of tokens) {
    if (!uniqueByAddress.has(token.address)) {
      uniqueByAddress.set(token.address, token);
    }
  }
  return Array.from(uniqueByAddress.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
}

function findTokenBySymbol(tokens: Token[], symbol: string): Token | null {
  const found = tokens.find((token) => token.symbol === symbol);
  return found ?? null;
}

function getEkuboQuoterChainId(chainId: ChainId): string {
  const literal = chainId.toLiteral();
  if (literal === "SN_MAIN") {
    return EKUBO_QUOTER_CHAIN_IDS.SN_MAIN;
  }
  if (literal === "SN_SEPOLIA") {
    return EKUBO_QUOTER_CHAIN_IDS.SN_SEPOLIA;
  }
  throw new Error(`Unsupported chain for Ekubo quote: ${literal}`);
}

function toHexFelt(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function serializeU128(value: bigint): string[] {
  if (value < 0n) {
    throw new Error("Negative values are not valid u128");
  }
  if (value > MAX_U128) {
    throw new Error("Value exceeds u128 range");
  }
  return [toHexFelt(value)];
}

function serializeU256(value: bigint): string[] {
  return serializeU128(value % 2n ** 128n).concat(
    serializeU128(value / 2n ** 128n)
  );
}

function serializeBoolean(value: boolean): string[] {
  return [value ? "0x1" : "0x0"];
}

function serializeI129(value: bigint): string[] {
  const absValue = value < 0n ? value * -1n : value;
  return [...serializeU128(absValue), ...serializeBoolean(value < 0n)];
}

function serializePoolKey(poolKey: EkuboPoolKey): string[] {
  return [
    poolKey.token0,
    poolKey.token1,
    toHexFelt(BigInt(poolKey.fee)),
    toHexFelt(BigInt(poolKey.tick_spacing)),
    toHexFelt(BigInt(poolKey.extension)),
  ];
}

function encodeMultihopRoute(
  route: EkuboRouteStep[],
  sourceToken: string
): string[] {
  let currentToken = BigInt(sourceToken);
  const encoded: string[] = [];

  for (const step of route) {
    const token0 = BigInt(step.pool_key.token0);
    const token1 = BigInt(step.pool_key.token1);
    if (currentToken !== token0 && currentToken !== token1) {
      throw new Error("Quote route token sequence is invalid");
    }

    currentToken = currentToken === token1 ? token0 : token1;
    encoded.push(
      ...serializePoolKey(step.pool_key),
      ...serializeU256(BigInt(step.sqrt_ratio_limit)),
      `${step.skip_ahead}`
    );
  }

  return encoded;
}

function getErrorMessageFromPayload(payload: unknown): string | null {
  if (!isObjectRecord(payload)) {
    return null;
  }
  return typeof payload.error === "string" ? payload.error : null;
}

function percentToBps(value: number | null): bigint | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return BigInt(Math.round(value * 100));
}

function parseEkuboQuoteResponse(payload: unknown): EkuboQuoteResponse {
  if (!isObjectRecord(payload)) {
    throw new Error("Ekubo quote response is malformed");
  }
  if (typeof payload.error === "string") {
    throw new Error(payload.error);
  }

  const totalCalculated = payload.total_calculated;
  const priceImpact = payload.price_impact;
  const splitsRaw = payload.splits;
  if (typeof totalCalculated !== "string" || !Array.isArray(splitsRaw)) {
    throw new Error("Ekubo quote response is missing required fields");
  }
  if (
    priceImpact !== null &&
    priceImpact !== undefined &&
    typeof priceImpact !== "number"
  ) {
    throw new Error("Ekubo quote response contains an invalid price impact");
  }

  const splits = splitsRaw.map((split, splitIndex): EkuboQuoteSplit => {
    if (!isObjectRecord(split)) {
      throw new Error(`Ekubo split #${splitIndex + 1} is malformed`);
    }
    if (
      typeof split.amount_specified !== "string" ||
      typeof split.amount_calculated !== "string" ||
      !Array.isArray(split.route)
    ) {
      throw new Error(
        `Ekubo split #${splitIndex + 1} is missing required fields`
      );
    }

    const route = split.route.map((step, stepIndex): EkuboRouteStep => {
      if (!isObjectRecord(step) || !isObjectRecord(step.pool_key)) {
        throw new Error(
          `Ekubo route step #${stepIndex + 1} in split #${splitIndex + 1} is malformed`
        );
      }

      const poolKey = step.pool_key;
      if (
        typeof poolKey.token0 !== "string" ||
        typeof poolKey.token1 !== "string" ||
        typeof poolKey.fee !== "string" ||
        (typeof poolKey.tick_spacing !== "string" &&
          typeof poolKey.tick_spacing !== "number") ||
        typeof poolKey.extension !== "string"
      ) {
        throw new Error(
          `Ekubo pool key in split #${splitIndex + 1}, step #${stepIndex + 1} is invalid`
        );
      }
      if (
        typeof step.sqrt_ratio_limit !== "string" ||
        (typeof step.skip_ahead !== "string" &&
          typeof step.skip_ahead !== "number")
      ) {
        throw new Error(
          `Ekubo route step #${stepIndex + 1} in split #${splitIndex + 1} is invalid`
        );
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

async function fetchEkuboQuote(params: {
  chainId: ChainId;
  amountInBase: bigint;
  tokenInAddress: string;
  tokenOutAddress: string;
}): Promise<EkuboQuoteResponse> {
  const chainId = getEkuboQuoterChainId(params.chainId);
  const url = `${EKUBO_QUOTER_API_BASE}/${chainId}/${params.amountInBase.toString()}/${params.tokenInAddress}/${params.tokenOutAddress}`;
  const response = await fetch(url);

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Ekubo quote failed (${response.status})`);
    }
    throw new Error("Ekubo quote returned a non-JSON response");
  }

  if (!response.ok) {
    const responseError = getErrorMessageFromPayload(payload);
    throw new Error(responseError ?? `Ekubo quote failed (${response.status})`);
  }

  return parseEkuboQuoteResponse(payload);
}

function buildEkuboSwapCalls(params: {
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
      calldata: [
        ...serializePoolKey(singleStep.pool_key),
        ...serializeU256(BigInt(singleStep.sqrt_ratio_limit)),
        `${singleStep.skip_ahead}`,
        sourceToken,
        ...serializeI129(amountInBase),
      ],
    };
  } else if (quote.splits.length === 1) {
    swapCall = {
      contractAddress: extensionRouter,
      entrypoint: "multihop_swap",
      calldata: [
        ...serializeU128(BigInt(firstSplit.route.length)),
        ...encodeMultihopRoute(firstSplit.route, sourceToken),
        sourceToken,
        ...serializeI129(BigInt(firstSplit.amount_specified)),
      ],
    };
  } else {
    swapCall = {
      contractAddress: extensionRouter,
      entrypoint: "multi_multihop_swap",
      calldata: [
        ...serializeU128(BigInt(quote.splits.length)),
        ...quote.splits.flatMap((split) => {
          if (!split.route.length) {
            throw new Error("Ekubo quote split route is empty");
          }
          return [
            ...serializeU128(BigInt(split.route.length)),
            ...encodeMultihopRoute(split.route, sourceToken),
            sourceToken,
            ...serializeI129(BigInt(split.amount_specified)),
          ];
        }),
      ],
    };
  }

  return [
    {
      contractAddress: tokenIn.address,
      entrypoint: "transfer",
      calldata: [extensionRouter, ...serializeU256(amountInBase)],
    },
    swapCall,
    {
      contractAddress: extensionRouter,
      entrypoint: "clear_minimum",
      calldata: [tokenOut.address, ...serializeU256(minimumOut)],
    },
    {
      contractAddress: extensionRouter,
      entrypoint: "clear",
      calldata: [tokenIn.address],
    },
  ];
}

function getRecommendedOutputToken(
  context: SwapIntegrationPairContext
): Token | null {
  const { chainId, tokenIn, tokens } = context;
  const candidates = chainId.isSepolia()
    ? ["USDC.e", "USDC", "ETH"]
    : ["USDC", "USDT", "DAI", "ETH"];

  for (const symbol of candidates) {
    const token = findTokenBySymbol(tokens, symbol);
    if (token && token.address !== tokenIn.address) {
      return token;
    }
  }

  return tokens.find((token) => token.address !== tokenIn.address) ?? null;
}

function getAvailableTokens(context: SwapIntegrationContext): Token[] {
  return dedupeAndSortTokens(context.tokens);
}

function toQuoteSummary(params: {
  quote: EkuboQuoteResponse;
  amountInBase: bigint;
  routeCallCount?: number;
}): SwapExecution["quote"] {
  return {
    amountInBase: params.amountInBase,
    amountOutBase: BigInt(params.quote.total_calculated),
    routeCallCount: params.routeCallCount,
    priceImpactBps: percentToBps(params.quote.price_impact),
    provider: "ekubo",
  };
}

async function getEkuboQuote(
  params: PrepareSwapParams
): Promise<SwapExecution["quote"]> {
  const { chainId, tokenIn, tokenOut, amountIn } = params;
  const amountInBase = amountIn.toBase();
  const quote = await fetchEkuboQuote({
    chainId,
    amountInBase,
    tokenInAddress: tokenIn.address,
    tokenOutAddress: tokenOut.address,
  });

  return toQuoteSummary({
    quote,
    amountInBase,
  });
}

async function swapEkubo(params: PrepareSwapParams): Promise<SwapExecution> {
  const { chainId, tokenIn, tokenOut, amountIn, slippageBps } = params;
  const amountInBase = amountIn.toBase();
  const quote = await fetchEkuboQuote({
    chainId,
    amountInBase,
    tokenInAddress: tokenIn.address,
    tokenOutAddress: tokenOut.address,
  });

  const preset = getEkuboPreset(chainId);
  const swapCalls = buildEkuboSwapCalls({
    quote,
    tokenIn,
    tokenOut,
    amountInBase,
    extensionRouter: preset.extensionRouter,
    slippageBps,
  });

  return {
    calls: swapCalls,
    quote: toQuoteSummary({
      quote,
      amountInBase,
      routeCallCount: swapCalls.length,
    }),
  };
}

export const ekuboSwapIntegration: SwapIntegration = {
  id: "ekubo",
  label: "Ekubo",
  supportsChain: (chainId) => {
    const literal = chainId.toLiteral();
    return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
  },
  getAvailableTokens,
  getRecommendedOutputToken,
  getQuote: getEkuboQuote,
  swap: swapEkubo,
};
