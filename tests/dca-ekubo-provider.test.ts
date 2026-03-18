import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcProvider } from "starknet";
import { Amount, ChainId, fromAddress, type Token } from "@/types";
import { DCA_CONTINUOUS_FREQUENCY } from "@/dca/interface";
import { EkuboDcaProvider, getEkuboDcaPreset } from "@/dca/ekubo";
import {
  assertNonNegativeInteger,
  parseEkuboOrdersResponse,
  parseIsoDurationSeconds,
  parseOrderInfoResult,
  parseEkuboPoolsResponse,
  parsePositiveBigInt,
  toEkuboDcaOrder,
  type EkuboOrderDescriptor,
} from "@/dca/ekubo.helpers";

const sellToken: Token = {
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress("0x111"),
};

const buyToken: Token = {
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  address: fromAddress("0x222"),
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

describe("EkuboDcaProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("supports mainnet and sepolia", () => {
    const provider = new EkuboDcaProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(true);
  });

  it("accepts hour-based ISO frequencies", () => {
    expect(parseIsoDurationSeconds("PT1H")).toBe(3600);
  });

  it("returns empty indexing pages without querying Ekubo", async () => {
    const fetchMock = vi.fn();
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {} as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    const page = await provider.getOrders(context, {
      traderAddress: context.walletAddress,
      status: "INDEXING",
      page: 2,
      size: 10,
    });

    expect(page).toEqual({
      content: [],
      totalPages: 0,
      totalElements: 0,
      size: 10,
      pageNumber: 2,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds native create calls from Ekubo pool discovery", async () => {
    const preset = getEkuboDcaPreset(ChainId.SEPOLIA);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        topPools: [
          {
            fee: "100",
            extension: "0x123",
          },
          {
            fee: "300",
            extension: preset.twammExtension,
          },
        ],
      })
    );
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1_000,
        }),
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    const prepared = await provider.prepareCreate(context, {
      sellToken,
      buyToken,
      sellAmount: Amount.parse("5", sellToken),
      sellAmountPerCycle: Amount.parse("1", sellToken),
      frequency: "P1D",
      traderAddress: context.walletAddress,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://mock-ekubo/pair/${BigInt(ChainId.SEPOLIA.toFelt252()).toString()}/${sellToken.address}/${buyToken.address}/pools`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(prepared.providerId).toBe("ekubo");
    expect(prepared.orderAddress).toBe(preset.positions);
    expect(prepared.calls).toHaveLength(3);
    expect(prepared.calls[0]).toMatchObject({
      contractAddress: sellToken.address,
      entrypoint: "transfer",
    });
    expect(prepared.calls[1]).toMatchObject({
      contractAddress: preset.positions,
      entrypoint: "mint_and_increase_sell_amount",
      calldata: expect.arrayContaining([
        sellToken.address,
        buyToken.address,
        "300",
        "5000000",
      ]),
    });
    expect(Number(prepared.calls[1]!.calldata[3])).toBeGreaterThan(1_000);
    expect(Number(prepared.calls[1]!.calldata[4])).toBeGreaterThan(
      Number(prepared.calls[1]!.calldata[3])
    );
    expect(prepared.calls[2]).toMatchObject({
      contractAddress: preset.positions,
      entrypoint: "clear",
      calldata: [sellToken.address],
    });
  });

  it("falls back to an exact TWAMM route fee from swap quotes when pair discovery fails", async () => {
    const preset = getEkuboDcaPreset(ChainId.SEPOLIA);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: "Internal server error" }, 500)
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total_calculated: "123",
          price_impact: 0.5,
          splits: [
            {
              amount_specified: "1000000",
              amount_calculated: "123",
              route: [
                {
                  pool_key: {
                    token0: sellToken.address,
                    token1: buyToken.address,
                    fee: "17014118346046923173168730371588410572",
                    tick_spacing: "1",
                    extension: preset.twammExtension,
                  },
                  sqrt_ratio_limit: "0",
                  skip_ahead: "0",
                },
              ],
            },
          ],
        })
      );
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      quoteApiBase: "https://mock-quoter",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1_000,
        }),
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    const prepared = await provider.prepareCreate(context, {
      sellToken,
      buyToken,
      sellAmount: Amount.parse("5", sellToken),
      sellAmountPerCycle: Amount.parse("1", sellToken),
      frequency: "P1D",
      traderAddress: context.walletAddress,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://mock-ekubo/pair/${BigInt(ChainId.SEPOLIA.toFelt252()).toString()}/${sellToken.address}/${buyToken.address}/pools`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://mock-quoter/393402133025997798000961/1000000/${sellToken.address}/${buyToken.address}`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(prepared.calls[1]).toMatchObject({
      entrypoint: "mint_and_increase_sell_amount",
      calldata: expect.arrayContaining([
        sellToken.address,
        buyToken.address,
        "17014118346046923173168730371588410572",
      ]),
    });
  });

  it("rejects quote fallback routes that only touch indirect TWAMM pools", async () => {
    const preset = getEkuboDcaPreset(ChainId.SEPOLIA);
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      quoteApiBase: "https://mock-quoter",
      fetcher: vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ error: "Internal server error" }, 500)
        )
        .mockResolvedValueOnce(
          jsonResponse({
            total_calculated: "123",
            price_impact: 0.5,
            splits: [
              {
                amount_specified: "1000000",
                amount_calculated: "123",
                route: [
                  {
                    pool_key: {
                      token0: buyToken.address,
                      token1: fromAddress("0x333"),
                      fee: "777",
                      tick_spacing: "1",
                      extension: preset.twammExtension,
                    },
                    sqrt_ratio_limit: "0",
                    skip_ahead: "0",
                  },
                ],
              },
            ],
          })
        ) as unknown as typeof fetch,
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1_000,
        }),
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    await expect(
      provider.prepareCreate(context, {
        sellToken,
        buyToken,
        sellAmount: Amount.parse("5", sellToken),
        sellAmountPerCycle: Amount.parse("1", sellToken),
        frequency: "P1D",
        traderAddress: context.walletAddress,
      })
    ).rejects.toThrow(
      "Ekubo pair pools request failed (500): Internal server error; quote fallback also failed: Ekubo quote fallback did not include an exact TWAMM-enabled pool for this pair"
    );
  });

  it("validates amount relationships before querying Ekubo", async () => {
    const fetchMock = vi.fn();
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        getBlock: vi.fn(),
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    await expect(
      provider.prepareCreate(context, {
        sellToken,
        buyToken,
        sellAmount: Amount.parse("1", sellToken),
        sellAmountPerCycle: Amount.parse("2", sellToken),
        frequency: "P1D",
        traderAddress: context.walletAddress,
      })
    ).rejects.toThrow("DCA sellAmountPerCycle cannot exceed sellAmount");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists Ekubo orders and enriches them with on-chain order info", async () => {
    const preset = getEkuboDcaPreset(ChainId.SEPOLIA);
    const chainId = BigInt(ChainId.SEPOLIA.toFelt252()).toString();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        orders: [
          {
            chain_id: chainId,
            nft_address: preset.positionsNft,
            token_id: "7",
            orders: [
              {
                key: {
                  sell_token: sellToken.address,
                  buy_token: buyToken.address,
                  fee: "300",
                  start_time: 1_900_000_000,
                  end_time: 1_900_086_400,
                },
                total_proceeds_withdrawn: "250000000000000000",
                sale_rate: "1200",
                last_collect_proceeds: null,
                total_amount_sold: "1000000",
              },
            ],
          },
        ],
        pagination: {
          page: 1,
          pageSize: 50,
          totalPages: 1,
          totalItems: 1,
        },
      })
    );
    const callContract = vi
      .fn()
      .mockResolvedValue(["1", "1200", "4000000", "500000000000000000"]);
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        callContract,
        getBlock: vi.fn().mockResolvedValue({ timestamp: 1_900_000_050 }),
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    const page = await provider.getOrders(context, {
      traderAddress: context.walletAddress,
      status: "ACTIVE",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://mock-ekubo/twap/orders/${context.walletAddress}?chainId=${chainId}&page=1&pageSize=50&state=opened`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(callContract).toHaveBeenCalledWith({
      contractAddress: preset.positions,
      entrypoint: "get_orders_info",
      calldata: [
        "1",
        "7",
        sellToken.address,
        buyToken.address,
        "300",
        "1900000000",
        "1900086400",
      ],
    });
    expect(page).toMatchObject({
      totalPages: 1,
      totalElements: 1,
      size: 50,
      pageNumber: 0,
    });
    expect(page.content[0]).toMatchObject({
      providerId: "ekubo",
      orderAddress: preset.positions,
      sellAmountBase: 5000000n,
      amountSoldBase: 1000000n,
      amountBoughtBase: 750000000000000000n,
      frequency: DCA_CONTINUOUS_FREQUENCY,
      status: "ACTIVE",
    });
    expect(page.content[0]!.id).toBe(
      `ekubo-v1:${preset.positions}:7:${sellToken.address}:${buyToken.address}:300:1900000000:1900086400`
    );
  });

  it("builds native cancel calls from a provider order id", async () => {
    const preset = getEkuboDcaPreset(ChainId.SEPOLIA);
    const callContract = vi
      .fn()
      .mockResolvedValue(["1200", "4000000", "500000000000000000"]);
    const provider = new EkuboDcaProvider();
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        callContract,
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };
    const orderId = `ekubo-v1:${preset.positions}:7:${sellToken.address}:${buyToken.address}:300:1710000000:1710086400`;

    const prepared = await provider.prepareCancel(context, {
      orderId,
    });

    expect(callContract).toHaveBeenCalledWith({
      contractAddress: preset.positions,
      entrypoint: "get_order_info",
      calldata: [
        "7",
        sellToken.address,
        buyToken.address,
        "300",
        "1710000000",
        "1710086400",
      ],
    });
    expect(prepared).toEqual({
      providerId: "ekubo",
      action: "cancel",
      orderId,
      orderAddress: preset.positions,
      calls: [
        {
          contractAddress: preset.positions,
          entrypoint: "withdraw_proceeds_from_sale_to_self",
          calldata: [
            "7",
            sellToken.address,
            buyToken.address,
            "300",
            "1710000000",
            "1710086400",
          ],
        },
        {
          contractAddress: preset.positions,
          entrypoint: "decrease_sale_rate_to_self",
          calldata: [
            "7",
            sellToken.address,
            buyToken.address,
            "300",
            "1710000000",
            "1710086400",
            "1200",
          ],
        },
      ],
    });
  });

  it("preserves negative bigint validation errors", () => {
    expect(() => parsePositiveBigInt("-1", "tokenId")).toThrow(
      "tokenId cannot be negative"
    );
  });

  it("rejects unsafe numeric metadata fields", () => {
    expect(() =>
      assertNonNegativeInteger(Number.MAX_SAFE_INTEGER + 1, "page")
    ).toThrow(`Invalid page: ${Number.MAX_SAFE_INTEGER + 1}`);
  });

  it("rejects malformed order payloads with missing required string fields", () => {
    expect(() =>
      parseEkuboOrdersResponse({
        orders: [
          {
            chain_id: BigInt(ChainId.SEPOLIA.toFelt252()).toString(),
            nft_address: getEkuboDcaPreset(ChainId.SEPOLIA).positionsNft,
            token_id: "7",
            orders: [
              {
                key: {
                  buy_token: buyToken.address,
                  fee: "300",
                  start_time: 1_900_000_000,
                  end_time: 1_900_086_400,
                },
                total_proceeds_withdrawn: "0",
                sale_rate: "1200",
                last_collect_proceeds: null,
                total_amount_sold: "1000000",
              },
            ],
          },
        ],
        pagination: {
          page: 1,
          pageSize: 50,
          totalPages: 1,
          totalItems: 1,
        },
      })
    ).toThrow("Invalid sell_token");
  });

  it("rejects malformed pool payloads with missing required string fields", () => {
    expect(() =>
      parseEkuboPoolsResponse({
        topPools: [
          {
            fee: "300",
          },
        ],
      })
    ).toThrow("Invalid extension");
  });

  it("rejects malformed order info tuples with extra fields", () => {
    expect(() => parseOrderInfoResult(["1", "2", "3", "4"])).toThrow(
      "Ekubo order info response is malformed"
    );
  });

  it("rejects cancel order ids for a different positions contract", async () => {
    const callContract = vi.fn();
    const provider = new EkuboDcaProvider();
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        callContract,
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    await expect(
      provider.prepareCancel(context, {
        orderId: `ekubo-v1:0x1234:7:${sellToken.address}:${buyToken.address}:300:1710000000:1710086400`,
      })
    ).rejects.toThrow(
      "Ekubo DCA orderId does not match the positions contract for the current chain"
    );

    expect(callContract).not.toHaveBeenCalled();
  });

  it("caps closeDate at now for early-closed future-dated orders", () => {
    const preset = getEkuboDcaPreset(ChainId.SEPOLIA);
    const descriptor: EkuboOrderDescriptor = {
      apiOrder: {
        key: {
          sell_token: sellToken.address,
          buy_token: buyToken.address,
          fee: "300",
          start_time: 1_900_000_000,
          end_time: 1_900_086_400,
        },
        total_proceeds_withdrawn: "0",
        sale_rate: "0",
        last_collect_proceeds: null,
        total_amount_sold: "0",
      },
      orderId: `ekubo-v1:${preset.positions}:7:${sellToken.address}:${buyToken.address}:300:1900000000:1900086400`,
      parsedOrderId: {
        positions: preset.positions,
        tokenId: 7n,
        orderKey: {
          sellToken: sellToken.address,
          buyToken: buyToken.address,
          fee: 300n,
          startTime: 1_900_000_000,
          endTime: 1_900_086_400,
        },
      },
    };

    const order = toEkuboDcaOrder({
      descriptor,
      info: {
        saleRate: 0n,
        remainingSellAmount: 5_000_000n,
        purchasedAmount: 0n,
      },
      traderAddress: fromAddress("0xabc"),
      providerId: "ekubo",
      nowSeconds: 1_900_000_100,
    });

    expect(order.status).toBe("CLOSED");
    expect(order.closeDate?.getTime()).toBe(1_900_000_100_000);
    expect(order.closeDate!.getTime()).toBeLessThan(order.endDate.getTime());
  });

  it("times out stalled Ekubo API requests", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    );
    const provider = new EkuboDcaProvider({
      apiBase: "https://mock-ekubo",
      quoteApiBase: "https://mock-quoter",
      fetcher: fetchMock as unknown as typeof fetch,
      presets: {
        SN_SEPOLIA: {
          fallbackTwammPoolFee: undefined,
        },
      },
    });
    const context = {
      chainId: ChainId.SEPOLIA,
      rpcProvider: {
        getBlock: vi.fn().mockResolvedValue({
          timestamp: 1_000,
        }),
      } as unknown as RpcProvider,
      walletAddress: fromAddress("0xabc"),
    };

    const promise = expect(
      provider.prepareCreate(context, {
        sellToken,
        buyToken,
        sellAmount: Amount.parse("5", sellToken),
        sellAmountPerCycle: Amount.parse("1", sellToken),
        frequency: "P1D",
        traderAddress: context.walletAddress,
      })
    ).rejects.toThrow(
      "Ekubo pair pools request timed out after 10000ms; quote fallback also failed: Ekubo quote fallback request timed out after 10000ms"
    );

    await vi.advanceTimersByTimeAsync(20_000);
    await promise;
  });
});
