import {
  type Address,
  type Call,
  type ChainId,
  type Token,
} from "starkzap";
import type {
  PrepareSwapParams,
  SwapExecutionPlan,
  SwapIntegration,
  SwapIntegrationContext,
  SwapIntegrationPairContext,
} from "@/swaps/interface";

const AVNU_API_BASE = "https://starknet.api.avnu.fi";
const DEFAULT_QUOTES_PAGE_SIZE = "1";

interface AvnuQuote {
  quoteId: string;
  sellAmount: string;
  buyAmount: string;
  priceImpact?: number | null;
}

interface AvnuBuildCall {
  contractAddress: string;
  entrypoint: string;
  calldata: unknown[];
}

interface AvnuBuildResponse {
  calls: AvnuBuildCall[];
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

function ensureSupportedChain(chainId: ChainId): void {
  const literal = chainId.toLiteral();
  if (literal !== "SN_MAIN" && literal !== "SN_SEPOLIA") {
    throw new Error(`Unsupported chain for AVNU quote: ${literal}`);
  }
}

function toHexFelt(value: bigint): string {
  if (value < 0n) {
    throw new Error("Negative values are not supported");
  }
  return `0x${value.toString(16)}`;
}

function getErrorMessageFromPayload(payload: unknown): string | null {
  if (!isObjectRecord(payload)) {
    return null;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }
  if (typeof payload.message === "string") {
    return payload.message;
  }

  return null;
}

function parseAvnuQuote(raw: unknown): AvnuQuote {
  if (!isObjectRecord(raw)) {
    throw new Error("AVNU quote payload is malformed");
  }

  if (
    typeof raw.quoteId !== "string" ||
    typeof raw.sellAmount !== "string" ||
    typeof raw.buyAmount !== "string"
  ) {
    throw new Error("AVNU quote is missing required fields");
  }

  const priceImpactRaw = raw.priceImpact;
  const priceImpact =
    typeof priceImpactRaw === "number" ? priceImpactRaw : priceImpactRaw == null ? null : null;

  return {
    quoteId: raw.quoteId,
    sellAmount: raw.sellAmount,
    buyAmount: raw.buyAmount,
    priceImpact,
  };
}

function parseAvnuQuotesResponse(payload: unknown): AvnuQuote[] {
  if (Array.isArray(payload)) {
    return payload.map(parseAvnuQuote);
  }

  if (isObjectRecord(payload)) {
    if (Array.isArray(payload.content)) {
      return payload.content.map(parseAvnuQuote);
    }
    if (Array.isArray(payload.quotes)) {
      return payload.quotes.map(parseAvnuQuote);
    }
  }

  throw new Error("AVNU quotes response is malformed");
}

function parseAvnuBuildResponse(payload: unknown): AvnuBuildResponse {
  if (!isObjectRecord(payload) || !Array.isArray(payload.calls)) {
    throw new Error("AVNU build response is malformed");
  }

  const calls = payload.calls.map((rawCall, index): AvnuBuildCall => {
    if (!isObjectRecord(rawCall) || !Array.isArray(rawCall.calldata)) {
      throw new Error(`AVNU build call #${index + 1} is malformed`);
    }
    if (
      typeof rawCall.contractAddress !== "string" ||
      typeof rawCall.entrypoint !== "string"
    ) {
      throw new Error(`AVNU build call #${index + 1} is invalid`);
    }

    return {
      contractAddress: rawCall.contractAddress,
      entrypoint: rawCall.entrypoint,
      calldata: rawCall.calldata,
    };
  });

  return { calls };
}

function normalizeAvnuCalls(calls: AvnuBuildCall[]): Call[] {
  if (!calls.length) {
    throw new Error("AVNU build returned no calls");
  }

  return calls.map((call) => ({
    contractAddress: call.contractAddress as Address,
    entrypoint: call.entrypoint,
    calldata: call.calldata.map((value) => `${value}`),
  }));
}

function bpsToPercent(bps: bigint): number {
  if (bps < 0n || bps >= 10_000n) {
    throw new Error("Invalid slippage bps");
  }
  return Number(bps) / 100;
}

function percentToBps(value: number | null): bigint | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return BigInt(Math.round(value * 100));
}

async function fetchAvnuQuote(params: {
  chainId: ChainId;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountInBase: bigint;
  takerAddress?: Address;
}): Promise<AvnuQuote> {
  ensureSupportedChain(params.chainId);

  const url = new URL(`${AVNU_API_BASE}/swap/v3/quotes`);
  url.searchParams.set("sellTokenAddress", params.tokenInAddress);
  url.searchParams.set("buyTokenAddress", params.tokenOutAddress);
  url.searchParams.set("sellAmount", toHexFelt(params.amountInBase));
  url.searchParams.set("size", DEFAULT_QUOTES_PAGE_SIZE);

  if (params.takerAddress) {
    url.searchParams.set("takerAddress", params.takerAddress);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`AVNU quote failed (${response.status})`);
    }
    throw new Error("AVNU quote returned a non-JSON response");
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(payload) ?? `AVNU quote failed (${response.status})`
    );
  }

  const quotes = parseAvnuQuotesResponse(payload);
  if (!quotes.length) {
    throw new Error("AVNU quote returned no routes");
  }

  return quotes[0]!;
}

async function buildAvnuSwapCalls(params: {
  quoteId: string;
  takerAddress?: Address;
  slippageBps?: bigint;
}): Promise<Call[]> {
  const body: Record<string, unknown> = {
    quoteId: params.quoteId,
    includeApprove: true,
  };

  if (params.takerAddress) {
    body.takerAddress = params.takerAddress;
  }
  if (params.slippageBps != null) {
    body.slippage = bpsToPercent(params.slippageBps);
  }

  const response = await fetch(`${AVNU_API_BASE}/swap/v3/build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`AVNU build failed (${response.status})`);
    }
    throw new Error("AVNU build returned a non-JSON response");
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessageFromPayload(payload) ?? `AVNU build failed (${response.status})`
    );
  }

  const parsed = parseAvnuBuildResponse(payload);
  return normalizeAvnuCalls(parsed.calls);
}

function getRecommendedOutputToken(context: SwapIntegrationPairContext): Token | null {
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

async function prepareAvnuSwap(params: PrepareSwapParams): Promise<SwapExecutionPlan> {
  const { chainId, tokenIn, tokenOut, amountIn, slippageBps, takerAddress } = params;
  const amountInBase = amountIn.toBase();

  const quote = await fetchAvnuQuote({
    chainId,
    tokenInAddress: tokenIn.address,
    tokenOutAddress: tokenOut.address,
    amountInBase,
    takerAddress,
  });

  const swapCalls = await buildAvnuSwapCalls({
    quoteId: quote.quoteId,
    takerAddress,
    slippageBps,
  });

  return {
    plan: {
      calls: swapCalls,
    },
    quote: {
      amountInBase: BigInt(quote.sellAmount),
      amountOutBase: BigInt(quote.buyAmount),
      routeCallCount: swapCalls.length,
      priceImpactBps: percentToBps(quote.priceImpact ?? null),
      provider: "avnu",
    },
  };
}

export const avnuSwapIntegration: SwapIntegration = {
  id: "avnu",
  label: "AVNU",
  supportsChain: (chainId) => {
    const literal = chainId.toLiteral();
    return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
  },
  getAvailableTokens,
  getRecommendedOutputToken,
  prepareSwap: prepareAvnuSwap,
};
