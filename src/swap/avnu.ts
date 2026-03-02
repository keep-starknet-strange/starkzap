import type { Address, ChainId } from "@/types";
import { CallData, type Call } from "starknet";
import type {
  PreparedSwap,
  SwapProvider,
  SwapQuote,
  SwapRequest,
} from "@/swap/interface";
import {
  BASE_URL,
  SEPOLIA_BASE_URL,
  getQuotes,
  quoteToCalls,
  type Quote,
} from "@avnu/avnu-sdk";

const DEFAULT_AVNU_API_BASES = {
  SN_MAIN: [BASE_URL],
  SN_SEPOLIA: [SEPOLIA_BASE_URL, BASE_URL],
} as const;

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

function normalizeAvnuCalls(calls: Call[]): Call[] {
  if (!calls.length) {
    throw new Error("AVNU build returned no calls");
  }

  return calls.map((call) => ({
    contractAddress: call.contractAddress as Address,
    entrypoint: `${call.entrypoint}`,
    calldata: CallData.compile(call.calldata ?? []),
  }));
}

function toSwapQuote(params: {
  quote: Quote;
  routeCallCount?: number;
}): SwapQuote {
  const quote: SwapQuote = {
    amountInBase: params.quote.sellAmount,
    amountOutBase: params.quote.buyAmount,
    priceImpactBps: percentToBps(params.quote.priceImpact ?? null),
    provider: "avnu",
  };
  if (params.routeCallCount != null) {
    quote.routeCallCount = params.routeCallCount;
  }
  return quote;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
    const literal = chainId.toLiteral();
    return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
  }

  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    const { quote } = await this.fetchQuoteForRequest(request);

    return toSwapQuote({ quote });
  }

  async swap(request: SwapRequest): Promise<PreparedSwap> {
    const { quote, apiBase } = await this.fetchQuoteForRequest(request);

    const slippage = bpsToPercent(request.slippageBps ?? DEFAULT_SLIPPAGE_BPS);
    const result = await quoteToCalls(
      {
        quoteId: quote.quoteId,
        slippage,
        executeApprove: true,
        ...(request.takerAddress != null && {
          takerAddress: request.takerAddress,
        }),
      },
      { baseUrl: apiBase }
    );
    const calls = normalizeAvnuCalls(result.calls as Call[]);

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
    let apiBases: string[];
    if (literal === "SN_MAIN") {
      apiBases = this.apiBases.SN_MAIN;
    } else if (literal === "SN_SEPOLIA") {
      apiBases = this.apiBases.SN_SEPOLIA;
    } else {
      throw new Error(`Unsupported chain for AVNU quote: ${literal}`);
    }

    if (apiBases.length === 0) {
      throw new Error(`No AVNU API base configured for chain: ${literal}`);
    }
    return [...apiBases];
  }

  private fetchQuoteForRequest(request: SwapRequest) {
    return this.fetchQuote({
      chainId: request.chainId,
      tokenInAddress: request.tokenIn.address,
      tokenOutAddress: request.tokenOut.address,
      amountInBase: request.amountIn.toBase(),
      ...(request.takerAddress != null && {
        takerAddress: request.takerAddress,
      }),
    });
  }

  private async fetchQuote(params: {
    chainId: ChainId;
    tokenInAddress: string;
    tokenOutAddress: string;
    amountInBase: bigint;
    takerAddress?: Address;
  }): Promise<{ quote: Quote; apiBase: string }> {
    const apiBases = this.getApiBases(params.chainId);
    const failures: string[] = [];

    for (const apiBase of apiBases) {
      try {
        const quotes = await getQuotes(
          {
            sellTokenAddress: params.tokenInAddress,
            buyTokenAddress: params.tokenOutAddress,
            sellAmount: params.amountInBase,
            size: this.quotesPageSize,
            ...(params.takerAddress != null && {
              takerAddress: params.takerAddress,
            }),
          },
          { baseUrl: apiBase }
        );

        if (!quotes.length) {
          failures.push(`${apiBase}: AVNU quote returned no routes`);
          continue;
        }

        return { quote: quotes[0]!, apiBase };
      } catch (error) {
        failures.push(`${apiBase}: ${getErrorMessage(error)}`);
      }
    }

    throw new Error(
      `AVNU quote returned no routes for this pair/amount. Try a larger amount, another token pair, or switch source. (${failures.join(" | ")})`
    );
  }
}
