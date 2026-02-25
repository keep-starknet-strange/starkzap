import { afterEach, describe, expect, it, vi } from "vitest";
import { Amount, ChainId, fromAddress, type Token } from "@/types";
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

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

describe("AvnuSwapProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("supports mainnet and sepolia", () => {
    const provider = new AvnuSwapProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(true);
  });

  it("fetches quotes and normalizes quote fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          quoteId: "q-1",
          sellAmount: "1000000",
          buyAmount: "2500000",
          priceImpact: 0.5,
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.origin).toBe("https://mock-main.avnu.fi");
    expect(parsed.pathname).toBe("/swap/v3/quotes");
    expect(parsed.searchParams.get("sellAmount")).toBe("0xf4240");
    expect(parsed.searchParams.get("sellTokenAddress")).toBe(tokenIn.address);
    expect(parsed.searchParams.get("buyTokenAddress")).toBe(tokenOut.address);
    expect(parsed.searchParams.get("takerAddress")).toBe(takerAddress);
  });

  it("builds swap calls and includes slippage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            quoteId: "q-42",
            sellAmount: "1000000",
            buyAmount: "2200000",
            priceImpact: 0.2,
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse({
          calls: [
            {
              contractAddress: "0x123",
              entrypoint: "swap",
              calldata: ["0x1", 2, 3n],
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
        calldata: ["0x1", "2", "3"],
      },
    ]);

    const [, init] = fetchMock.mock.calls[1]!;
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      quoteId: "q-42",
      includeApprove: true,
      takerAddress,
      slippage: 0.01,
    });
  });

  it("falls back to second Sepolia endpoint when first has no routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            quoteId: "q-2",
            sellAmount: "1000000",
            buyAmount: "1900000",
          },
        ])
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const provider = new AvnuSwapProvider();

    const quote = await provider.getQuote({
      chainId: ChainId.SEPOLIA,
      tokenIn,
      tokenOut,
      amountIn: Amount.parse("1", tokenIn),
    });

    expect(quote.amountOutBase).toBe(1900000n);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1]![0] as string);
    expect(firstUrl.origin).toBe("https://sepolia.api.avnu.fi");
    expect(secondUrl.origin).toBe("https://starknet.api.avnu.fi");
  });

  it("returns actionable error when all routes are unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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

  it("throws when AVNU build returns zero calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            quoteId: "q-empty",
            sellAmount: "1000000",
            buyAmount: "1200000",
          },
        ])
      )
      .mockResolvedValueOnce(
        jsonResponse({
          calls: [],
        })
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
