import { afterEach, describe, expect, it, vi } from "vitest";
import { Amount, ChainId, fromAddress, type Token } from "@/types";
import { EkuboSwapProvider, getEkuboPreset } from "@/swap/ekubo";

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

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function singleRouteQuote(payload?: Partial<Record<string, unknown>>) {
  return {
    total_calculated: "2500000",
    price_impact: 0.5,
    splits: [
      {
        amount_specified: "1000000",
        amount_calculated: "2500000",
        route: [
          {
            pool_key: {
              token0: tokenIn.address,
              token1: tokenOut.address,
              fee: "300",
              tick_spacing: "1",
              extension: "0x0",
            },
            sqrt_ratio_limit: "0",
            skip_ahead: "0",
          },
        ],
      },
    ],
    ...payload,
  };
}

describe("EkuboSwapProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("supports mainnet and sepolia", () => {
    const provider = new EkuboSwapProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(true);
  });

  it("fetches quote and normalizes quote fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(singleRouteQuote()));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const provider = new EkuboSwapProvider({
      apiBase: "https://mock-ekubo",
    });

    const quote = await provider.getQuote({
      chainId: ChainId.SEPOLIA,
      tokenIn,
      tokenOut,
      amountIn: Amount.parse("1", tokenIn),
    });

    expect(quote).toEqual({
      amountInBase: 1000000n,
      amountOutBase: 2500000n,
      routeCallCount: undefined,
      priceImpactBps: 50n,
      provider: "ekubo",
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://mock-ekubo/393402133025997798000961/1000000/${tokenIn.address}/${tokenOut.address}`
    );
  });

  it("builds swap calls from quote response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(singleRouteQuote()));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const provider = new EkuboSwapProvider({
      apiBase: "https://mock-ekubo",
    });

    const prepared = await provider.swap({
      chainId: ChainId.SEPOLIA,
      tokenIn,
      tokenOut,
      amountIn: Amount.parse("1", tokenIn),
      slippageBps: 100n,
    });

    expect(prepared.quote.amountInBase).toBe(1000000n);
    expect(prepared.quote.amountOutBase).toBe(2500000n);
    expect(prepared.quote.routeCallCount).toBe(4);
    expect(prepared.calls).toHaveLength(4);
    expect(prepared.calls[0]).toMatchObject({
      contractAddress: tokenIn.address,
      entrypoint: "transfer",
    });
    expect(prepared.calls[1]).toMatchObject({
      contractAddress: getEkuboPreset(ChainId.SEPOLIA).extensionRouter,
      entrypoint: "swap",
    });
    expect(prepared.calls[2]).toMatchObject({
      entrypoint: "clear_minimum",
    });
    expect(prepared.calls[3]).toMatchObject({
      entrypoint: "clear",
    });
  });

  it("throws when Ekubo returns no routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(singleRouteQuote({ splits: [] })));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const provider = new EkuboSwapProvider({
      apiBase: "https://mock-ekubo",
    });

    await expect(
      provider.swap({
        chainId: ChainId.SEPOLIA,
        tokenIn,
        tokenOut,
        amountIn: Amount.parse("1", tokenIn),
      })
    ).rejects.toThrow("Ekubo quote returned no routes");
  });
});
