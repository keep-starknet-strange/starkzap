import type { Address, ChainId } from "@/types";
import type { Call } from "starknet";
import type {
  PreparedSwap,
  SwapProvider,
  SwapQuote,
  SwapRequest,
} from "@/swap/interface";
import {
  DEFAULT_AVNU_API_BASES,
  normalizeAvnuCalls,
  supportsAvnuChain,
  withAvnuApiBaseFallback,
} from "@/utils/avnu";
import { getQuotes, quoteToCalls, type Quote } from "@avnu/avnu-sdk";

const DEFAULT_QUOTES_PAGE_SIZE = 5;
const DEFAULT_SLIPPAGE_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;

export interface AvnuSwapProviderOptions {
  /** Optional API base override per chain. */
  apiBases?: Partial<Record<"SN_MAIN" | "SN_SEPOLIA", string[]>>;
  /** Optional max quotes requested from AVNU quote API. */
  quotesPageSize?: number;
}

function validateQuotesPageSize(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("AVNU quotesPageSize must be a positive integer");
  }
  return value;
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

function toSwapQuote(params: {
  quote: Quote;
  routeCallCount?: number;
}): SwapQuote {
  const normalizedQuote: SwapQuote = {
    amountInBase: params.quote.sellAmount,
    amountOutBase: params.quote.buyAmount,
    priceImpactBps: percentToBps(params.quote.priceImpact ?? null),
    provider: "avnu",
  };

  if (params.routeCallCount != null) {
    normalizedQuote.routeCallCount = params.routeCallCount;
  }

  return normalizedQuote;
}

export class AvnuSwapProvider implements SwapProvider {
  readonly id = "avnu";

  private readonly apiBases: Record<"SN_MAIN" | "SN_SEPOLIA", string[]>;
  private readonly quotesPageSize: number;

  constructor(options: AvnuSwapProviderOptions = {}) {
    this.apiBases = {
      SN_MAIN: options.apiBases?.SN_MAIN ?? [...DEFAULT_AVNU_API_BASES.SN_MAIN],
      SN_SEPOLIA: options.apiBases?.SN_SEPOLIA ?? [
        ...DEFAULT_AVNU_API_BASES.SN_SEPOLIA,
      ],
    };
    this.quotesPageSize = validateQuotesPageSize(
      options.quotesPageSize ?? DEFAULT_QUOTES_PAGE_SIZE
    );
  }

  supportsChain(chainId: ChainId): boolean {
    return supportsAvnuChain(chainId);
  }

  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    const { quote } = await this.fetchQuoteForRequest(request);

    return toSwapQuote({ quote });
  }

  async prepareSwap(request: SwapRequest): Promise<PreparedSwap> {
    const { quote, apiBase } = await this.fetchQuoteForRequest(request);

    const slippage = bpsToPercent(request.slippageBps ?? DEFAULT_SLIPPAGE_BPS);
    const quoteToCallsRequest: Parameters<typeof quoteToCalls>[0] = {
      quoteId: quote.quoteId,
      slippage,
      executeApprove: true,
    };

    if (request.takerAddress != null) {
      quoteToCallsRequest.takerAddress = request.takerAddress;
    }

    const result = await quoteToCalls(quoteToCallsRequest, {
      baseUrl: apiBase,
    });
    const calls = normalizeAvnuCalls(
      result.calls as Call[],
      "AVNU build returned no calls"
    );

    return {
      calls,
      quote: toSwapQuote({
        quote,
        routeCallCount: calls.length,
      }),
    };
  }
  private fetchQuoteForRequest(request: SwapRequest) {
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
      amountInBase: request.amountIn.toBase(),
    };

    if (request.takerAddress != null) {
      quoteRequest.takerAddress = request.takerAddress;
    }

    return this.fetchQuote(quoteRequest);
  }

  private async fetchQuote(params: {
    chainId: ChainId;
    tokenInAddress: string;
    tokenOutAddress: string;
    amountInBase: bigint;
    takerAddress?: Address;
  }): Promise<{ quote: Quote; apiBase: string }> {
    return withAvnuApiBaseFallback({
      apiBasesByChain: this.apiBases,
      chainId: params.chainId,
      feature: "quote",
      action: "quote",
      run: async (apiBase) => {
        const quotesRequest: Parameters<typeof getQuotes>[0] = {
          sellTokenAddress: params.tokenInAddress,
          buyTokenAddress: params.tokenOutAddress,
          sellAmount: params.amountInBase,
          size: this.quotesPageSize,
        };

        if (params.takerAddress != null) {
          quotesRequest.takerAddress = params.takerAddress;
        }

        const quotes = await getQuotes(quotesRequest, { baseUrl: apiBase });

        if (!quotes.length) {
          throw new Error("AVNU quote returned no routes");
        }

        return { quote: quotes[0]!, apiBase };
      },
      formatFinalError: (failures) =>
        `AVNU quote returned no routes for this pair/amount. Try a larger amount, another token pair, or switch source. (${failures.join(" | ")})`,
    });
  }
}
