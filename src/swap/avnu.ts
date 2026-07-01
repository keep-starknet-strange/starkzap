import type { Address, ChainId } from "@/types";
import type { Call } from "starknet";
import type {
  PreparedSwap,
  SwapProvider,
  SwapQuote,
  SwapRequest,
} from "@/swap/interface";
import {
  type AvnuApiBases,
  type AvnuSdkModule,
  loadAvnuSdk,
  normalizeAvnuCalls,
  resolveAvnuApiBases,
  supportsAvnuChain,
  withAvnuApiBaseFallback,
} from "@/utils/avnu";
import type { Quote } from "@avnu/avnu-sdk";

const AVNU_SWAP_FEATURE = "AVNU swaps";

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

  private readonly apiBaseOverrides: AvnuSwapProviderOptions["apiBases"];
  private readonly quotesPageSize: number;
  private resolvedApiBases: AvnuApiBases | undefined;

  constructor(options: AvnuSwapProviderOptions = {}) {
    this.apiBaseOverrides = options.apiBases;
    this.quotesPageSize = validateQuotesPageSize(
      options.quotesPageSize ?? DEFAULT_QUOTES_PAGE_SIZE
    );
  }

  supportsChain(chainId: ChainId): boolean {
    return supportsAvnuChain(chainId);
  }

  /**
   * Load the avnu SDK (running the optional-peer-dependency check) and resolve
   * the per-chain API bases from its URL constants on first use.
   */
  private async ready(): Promise<{
    sdk: AvnuSdkModule;
    apiBases: AvnuApiBases;
  }> {
    const sdk = await loadAvnuSdk(AVNU_SWAP_FEATURE);
    this.resolvedApiBases ??= resolveAvnuApiBases(sdk, this.apiBaseOverrides);
    return { sdk, apiBases: this.resolvedApiBases };
  }

  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    const { quote } = await this.fetchQuoteForRequest(request);

    return toSwapQuote({ quote });
  }

  async prepareSwap(request: SwapRequest): Promise<PreparedSwap> {
    const { sdk } = await this.ready();
    const { quote, apiBase } = await this.fetchQuoteForRequest(request);

    const slippage = bpsToPercent(request.slippageBps ?? DEFAULT_SLIPPAGE_BPS);
    const quoteToCallsRequest: Parameters<AvnuSdkModule["quoteToCalls"]>[0] = {
      quoteId: quote.quoteId,
      slippage,
      executeApprove: true,
    };

    if (request.takerAddress != null) {
      quoteToCallsRequest.takerAddress = request.takerAddress;
    }

    const result = await sdk.quoteToCalls(quoteToCallsRequest, {
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
    const { sdk, apiBases } = await this.ready();
    return withAvnuApiBaseFallback({
      apiBasesByChain: apiBases,
      chainId: params.chainId,
      feature: "quote",
      action: "quote",
      run: async (apiBase) => {
        const quotesRequest: Parameters<AvnuSdkModule["getQuotes"]>[0] = {
          sellTokenAddress: params.tokenInAddress,
          buyTokenAddress: params.tokenOutAddress,
          sellAmount: params.amountInBase,
          size: this.quotesPageSize,
        };

        if (params.takerAddress != null) {
          quotesRequest.takerAddress = params.takerAddress;
        }

        const quotes = await sdk.getQuotes(quotesRequest, { baseUrl: apiBase });

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
