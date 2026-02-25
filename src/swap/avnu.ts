import type { Address, ChainId } from "@/types";
import type { Call } from "starknet";
import type {
  PreparedSwap,
  SwapProvider,
  SwapQuote,
  SwapRequest,
} from "@/swap/interface";

const DEFAULT_AVNU_API_BASES = {
  SN_MAIN: ["https://starknet.api.avnu.fi"],
  SN_SEPOLIA: ["https://sepolia.api.avnu.fi", "https://starknet.api.avnu.fi"],
} as const;

const DEFAULT_QUOTES_PAGE_SIZE = 5;
const BPS_DENOMINATOR = 10_000n;

class AvnuNoRoutesError extends Error {
  readonly code = "AVNU_NO_ROUTES";
}

interface AvnuQuotePayload {
  quoteId: string;
  sellAmount: string;
  buyAmount: string;
  priceImpact?: number | null;
}

interface AvnuBuildCallPayload {
  contractAddress: string;
  entrypoint: string;
  calldata: unknown[];
}

interface AvnuBuildPayload {
  calls: AvnuBuildCallPayload[];
}

export interface AvnuSwapProviderOptions {
  /** Optional API base override per chain. */
  apiBases?: Partial<Record<"SN_MAIN" | "SN_SEPOLIA", string[]>>;
  /** Optional max quotes requested from AVNU quote API. */
  quotesPageSize?: number;
  /** Optional fetch implementation override for custom runtimes/tests. */
  fetcher?: typeof fetch;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function parseAvnuQuotePayload(raw: unknown): AvnuQuotePayload {
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
    typeof priceImpactRaw === "number"
      ? priceImpactRaw
      : priceImpactRaw == null
        ? null
        : null;

  return {
    quoteId: raw.quoteId,
    sellAmount: raw.sellAmount,
    buyAmount: raw.buyAmount,
    priceImpact,
  };
}

function parseAvnuQuotesResponse(payload: unknown): AvnuQuotePayload[] {
  if (Array.isArray(payload)) {
    return payload.map(parseAvnuQuotePayload);
  }

  if (isObjectRecord(payload)) {
    if (Array.isArray(payload.content)) {
      return payload.content.map(parseAvnuQuotePayload);
    }
    if (Array.isArray(payload.quotes)) {
      return payload.quotes.map(parseAvnuQuotePayload);
    }
  }

  throw new Error("AVNU quotes response is malformed");
}

function parseAvnuBuildResponse(payload: unknown): AvnuBuildPayload {
  if (!isObjectRecord(payload) || !Array.isArray(payload.calls)) {
    throw new Error("AVNU build response is malformed");
  }

  const calls = payload.calls.map((rawCall, index): AvnuBuildCallPayload => {
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

function toHexFelt(value: bigint): string {
  if (value < 0n) {
    throw new Error("Negative values are not supported");
  }
  return `0x${value.toString(16)}`;
}

function bpsToPercent(bps: bigint): number {
  if (bps < 0n || bps >= BPS_DENOMINATOR) {
    throw new Error("Invalid slippage bps");
  }
  return Number(bps) / Number(BPS_DENOMINATOR);
}

function percentToBps(value: number | null): bigint | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return BigInt(Math.round(value * 100));
}

function normalizeAvnuCalls(calls: AvnuBuildCallPayload[]): Call[] {
  if (!calls.length) {
    throw new Error("AVNU build returned no calls");
  }

  return calls.map((call) => ({
    contractAddress: call.contractAddress as Address,
    entrypoint: call.entrypoint,
    calldata: call.calldata.map((value) => `${value}`),
  }));
}

function toSwapQuote(params: {
  quote: AvnuQuotePayload;
  routeCallCount?: number;
}): SwapQuote {
  const quote: SwapQuote = {
    amountInBase: BigInt(params.quote.sellAmount),
    amountOutBase: BigInt(params.quote.buyAmount),
    priceImpactBps: percentToBps(params.quote.priceImpact ?? null),
    provider: "avnu",
  };
  if (params.routeCallCount != null) {
    quote.routeCallCount = params.routeCallCount;
  }
  return quote;
}

export class AvnuSwapProvider implements SwapProvider {
  readonly id = "avnu";

  private readonly apiBases: Record<"SN_MAIN" | "SN_SEPOLIA", string[]>;
  private readonly quotesPageSize: number;
  private readonly fetcher: typeof fetch;

  constructor(options: AvnuSwapProviderOptions = {}) {
    this.apiBases = {
      SN_MAIN: options.apiBases?.SN_MAIN ?? [...DEFAULT_AVNU_API_BASES.SN_MAIN],
      SN_SEPOLIA: options.apiBases?.SN_SEPOLIA ?? [
        ...DEFAULT_AVNU_API_BASES.SN_SEPOLIA,
      ],
    };
    this.quotesPageSize = options.quotesPageSize ?? DEFAULT_QUOTES_PAGE_SIZE;
    this.fetcher = options.fetcher ?? fetch;
  }

  supportsChain(chainId: ChainId): boolean {
    const literal = chainId.toLiteral();
    return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
  }

  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    const amountInBase = request.amountIn.toBase();
    const quoteRequest: {
      chainId: ChainId;
      tokenInAddress: string;
      tokenOutAddress: string;
      amountInBase: bigint;
      takerAddress?: Address;
    } = {
      chainId: request.chainId,
      tokenInAddress: request.tokenIn.address,
      tokenOutAddress: request.tokenOut.address,
      amountInBase,
    };
    if (request.takerAddress) {
      quoteRequest.takerAddress = request.takerAddress;
    }
    const { quote } = await this.fetchQuote(quoteRequest);

    return toSwapQuote({ quote });
  }

  async swap(request: SwapRequest): Promise<PreparedSwap> {
    const amountInBase = request.amountIn.toBase();

    const quoteRequest: {
      chainId: ChainId;
      tokenInAddress: string;
      tokenOutAddress: string;
      amountInBase: bigint;
      takerAddress?: Address;
    } = {
      chainId: request.chainId,
      tokenInAddress: request.tokenIn.address,
      tokenOutAddress: request.tokenOut.address,
      amountInBase,
    };
    if (request.takerAddress) {
      quoteRequest.takerAddress = request.takerAddress;
    }
    const { quote, apiBase } = await this.fetchQuote(quoteRequest);

    const buildRequest: {
      apiBase: string;
      quoteId: string;
      takerAddress?: Address;
      slippageBps?: bigint;
    } = {
      apiBase,
      quoteId: quote.quoteId,
    };
    if (request.takerAddress) {
      buildRequest.takerAddress = request.takerAddress;
    }
    if (request.slippageBps != null) {
      buildRequest.slippageBps = request.slippageBps;
    }
    const calls = await this.buildSwapCalls(buildRequest);

    return {
      calls,
      quote: toSwapQuote({
        quote,
        routeCallCount: calls.length,
      }),
    };
  }

  private getApiBases(chainId: ChainId): string[] {
    const literal = chainId.toLiteral();
    if (literal === "SN_MAIN") {
      return [...this.apiBases.SN_MAIN];
    }
    if (literal === "SN_SEPOLIA") {
      return [...this.apiBases.SN_SEPOLIA];
    }
    throw new Error(`Unsupported chain for AVNU quote: ${literal}`);
  }

  private async fetchQuoteFromBase(params: {
    apiBase: string;
    tokenInAddress: string;
    tokenOutAddress: string;
    amountInBase: bigint;
    takerAddress?: Address;
  }): Promise<AvnuQuotePayload> {
    const url = new URL(`${params.apiBase}/swap/v3/quotes`);
    url.searchParams.set("sellTokenAddress", params.tokenInAddress);
    url.searchParams.set("buyTokenAddress", params.tokenOutAddress);
    url.searchParams.set("sellAmount", toHexFelt(params.amountInBase));
    url.searchParams.set("size", `${this.quotesPageSize}`);

    if (params.takerAddress) {
      url.searchParams.set("takerAddress", params.takerAddress);
    }

    const response = await this.fetcher(url.toString(), {
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
        getErrorMessageFromPayload(payload) ??
          `AVNU quote failed (${response.status})`
      );
    }

    const quotes = parseAvnuQuotesResponse(payload);
    if (!quotes.length) {
      throw new AvnuNoRoutesError(
        getErrorMessageFromPayload(payload) ?? "AVNU quote returned no routes"
      );
    }

    return quotes[0]!;
  }

  private async fetchQuote(params: {
    chainId: ChainId;
    tokenInAddress: string;
    tokenOutAddress: string;
    amountInBase: bigint;
    takerAddress?: Address;
  }): Promise<{ quote: AvnuQuotePayload; apiBase: string }> {
    const apiBases = this.getApiBases(params.chainId);
    const failures: string[] = [];

    for (const apiBase of apiBases) {
      try {
        const quoteRequest: {
          apiBase: string;
          tokenInAddress: string;
          tokenOutAddress: string;
          amountInBase: bigint;
          takerAddress?: Address;
        } = {
          apiBase,
          tokenInAddress: params.tokenInAddress,
          tokenOutAddress: params.tokenOutAddress,
          amountInBase: params.amountInBase,
        };
        if (params.takerAddress) {
          quoteRequest.takerAddress = params.takerAddress;
        }
        const quote = await this.fetchQuoteFromBase(quoteRequest);
        return { quote, apiBase };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${apiBase}: ${message}`);
        if (error instanceof AvnuNoRoutesError) {
          continue;
        }
        continue;
      }
    }

    throw new Error(
      `AVNU quote returned no routes for this pair/amount. Try a larger amount, another token pair, or switch source. (${failures.join(" | ")})`
    );
  }

  private async buildSwapCalls(params: {
    apiBase: string;
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

    const response = await this.fetcher(`${params.apiBase}/swap/v3/build`, {
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
        getErrorMessageFromPayload(payload) ??
          `AVNU build failed (${response.status})`
      );
    }

    const parsed = parseAvnuBuildResponse(payload);
    return normalizeAvnuCalls(parsed.calls);
  }
}
