import { afterEach, describe, expect, it, vi } from "vitest";
import { Amount, ChainId, fromAddress, type Token } from "@/types";

const avnuMocks = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  quoteToCalls: vi.fn(),
}));

vi.mock("@avnu/avnu-sdk", () => ({
  BASE_URL: "https://starknet.api.avnu.fi",
  SEPOLIA_BASE_URL: "https://sepolia.api.avnu.fi",
  getQuotes: avnuMocks.getQuotes,
  quoteToCalls: avnuMocks.quoteToCalls,
}));

import { AvnuSwapProvider } from "@/swap/avnu";

const tokenIn: Token = {
  name: "Token In",
  symbol: "TIN",
  decimals: 6,
  address: fromAddress("0x111"),
};

const tokenOut: Token = {
  name: "Token Out",
  symbol: "TOUT",
  decimals: 6,
  address: fromAddress("0x222"),
};

const takerAddress = fromAddress("0xabc");

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    quoteId: "q-1",
    sellAmount: 1000000n,
    buyAmount: 2500000n,
    priceImpact: 0.5,
    ...overrides,
  };
}

describe("AvnuSwapProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    avnuMocks.getQuotes.mockReset();
    avnuMocks.quoteToCalls.mockReset();
  });

  it("supports mainnet and sepolia", () => {
    const provider = new AvnuSwapProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(true);
  });

  it("fetches quotes and normalizes quote fields", async () => {
    avnuMocks.getQuotes.mockResolvedValue([makeQuote()]);

    const provider = new AvnuSwapProvider({
      apiBases: {
        SN_MAIN: ["https://mock-main.avnu.fi"],
      },
    });

    const quote = await provider.getQuote({
      chainId: ChainId.MAINNET,
      takerAddress,
      tokenIn,
      tokenOut,
      amountIn: Amount.parse("1", tokenIn),
    });

    expect(quote).toEqual({
      amountInBase: 1000000n,
      amountOutBase: 2500000n,
      routeCallCount: undefined,
      priceImpactBps: 50n,
      provider: "avnu",
    });

    expect(avnuMocks.getQuotes).toHaveBeenCalledWith(
      {
        sellTokenAddress: tokenIn.address,
        buyTokenAddress: tokenOut.address,
        sellAmount: 1000000n,
        size: 5,
        takerAddress,
      },
      { baseUrl: "https://mock-main.avnu.fi" }
    );
  });

  it("builds swap calls and includes slippage", async () => {
    avnuMocks.getQuotes.mockResolvedValue([
      makeQuote({
        quoteId: "q-42",
        buyAmount: 2200000n,
        priceImpact: 0.2,
      }),
    ]);
    avnuMocks.quoteToCalls.mockResolvedValue({
      chainId: "SN_MAIN",
      calls: [
        {
          contractAddress: "0x123",
          entrypoint: "swap",
          calldata: ["0x1", 2, 3n],
        },
      ],
    });

    const provider = new AvnuSwapProvider({
      apiBases: {
        SN_MAIN: ["https://mock-main.avnu.fi"],
      },
    });

    const prepared = await provider.swap({
      chainId: ChainId.MAINNET,
      takerAddress,
      tokenIn,
      tokenOut,
      amountIn: Amount.parse("1", tokenIn),
      slippageBps: 100n,
    });

    expect(prepared.quote.amountInBase).toBe(1000000n);
    expect(prepared.quote.amountOutBase).toBe(2200000n);
    expect(prepared.quote.routeCallCount).toBe(1);
    expect(prepared.calls).toEqual([
      {
        contractAddress: "0x123",
        entrypoint: "swap",
        calldata: ["1", "2", "3"],
      },
    ]);

    expect(avnuMocks.quoteToCalls).toHaveBeenCalledWith(
      {
        quoteId: "q-42",
        slippage: 0.01,
        executeApprove: true,
        takerAddress,
      },
      { baseUrl: "https://mock-main.avnu.fi" }
    );
  });

  it("falls back to second Sepolia endpoint when first has no routes", async () => {
    avnuMocks.getQuotes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeQuote({ quoteId: "q-2", buyAmount: 1900000n }),
      ]);

    const provider = new AvnuSwapProvider();

    const quote = await provider.getQuote({
      chainId: ChainId.SEPOLIA,
      tokenIn,
      tokenOut,
      amountIn: Amount.parse("1", tokenIn),
    });

    expect(quote.amountOutBase).toBe(1900000n);
    expect(avnuMocks.getQuotes).toHaveBeenCalledTimes(2);
    expect(avnuMocks.getQuotes.mock.calls[0]![1]).toEqual({
      baseUrl: "https://sepolia.api.avnu.fi",
    });
    expect(avnuMocks.getQuotes.mock.calls[1]![1]).toEqual({
      baseUrl: "https://starknet.api.avnu.fi",
    });
  });

  it("returns actionable error when all routes are unavailable", async () => {
    avnuMocks.getQuotes.mockResolvedValue([]);

    const provider = new AvnuSwapProvider();

    await expect(
      provider.getQuote({
        chainId: ChainId.SEPOLIA,
        tokenIn,
        tokenOut,
        amountIn: Amount.parse("1", tokenIn),
      })
    ).rejects.toThrow("AVNU quote returned no routes for this pair/amount");
  });

  it("throws when quotesPageSize is invalid", () => {
    expect(() => new AvnuSwapProvider({ quotesPageSize: 0 })).toThrow(
      "AVNU quotesPageSize must be a positive integer"
    );
    expect(() => new AvnuSwapProvider({ quotesPageSize: -1 })).toThrow(
      "AVNU quotesPageSize must be a positive integer"
    );
    expect(() => new AvnuSwapProvider({ quotesPageSize: 1.5 })).toThrow(
      "AVNU quotesPageSize must be a positive integer"
    );
  });

  it("throws when no API base is configured for the target chain", async () => {
    const provider = new AvnuSwapProvider({
      apiBases: { SN_MAIN: [] },
    });

    await expect(
      provider.getQuote({
        chainId: ChainId.MAINNET,
        tokenIn,
        tokenOut,
        amountIn: Amount.parse("1", tokenIn),
      })
    ).rejects.toThrow("No AVNU API base configured for chain: SN_MAIN");
  });

  it("throws when AVNU build returns zero calls", async () => {
    avnuMocks.getQuotes.mockResolvedValue([makeQuote({ quoteId: "q-empty" })]);
    avnuMocks.quoteToCalls.mockResolvedValue({
      chainId: "SN_MAIN",
      calls: [],
    });

    const provider = new AvnuSwapProvider({
      apiBases: {
        SN_MAIN: ["https://mock-main.avnu.fi"],
      },
    });

    await expect(
      provider.swap({
        chainId: ChainId.MAINNET,
        tokenIn,
        tokenOut,
        amountIn: Amount.parse("1", tokenIn),
      })
    ).rejects.toThrow("AVNU build returned no calls");
  });
});
