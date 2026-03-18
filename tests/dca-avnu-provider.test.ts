import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcProvider } from "starknet";
import { Amount, ChainId, fromAddress, type Token } from "@/types";

const avnuMocks = vi.hoisted(() => ({
  getDcaOrders: vi.fn(),
  createDcaToCalls: vi.fn(),
  cancelDcaToCalls: vi.fn(),
}));

vi.mock("@avnu/avnu-sdk", () => ({
  BASE_URL: "https://starknet.api.avnu.fi",
  SEPOLIA_BASE_URL: "https://sepolia.api.avnu.fi",
  DcaOrderStatus: {
    INDEXING: "INDEXING",
    ACTIVE: "ACTIVE",
    CLOSED: "CLOSED",
  },
  getDcaOrders: avnuMocks.getDcaOrders,
  createDcaToCalls: avnuMocks.createDcaToCalls,
  cancelDcaToCalls: avnuMocks.cancelDcaToCalls,
}));

import { AvnuDcaProvider } from "@/dca/avnu";

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

const traderAddress = fromAddress("0xabc");
const context = {
  chainId: ChainId.SEPOLIA,
  rpcProvider: {} as RpcProvider,
  walletAddress: traderAddress,
};

function makeOrdersPage() {
  return {
    content: [
      {
        id: "order-1",
        blockNumber: 42,
        timestamp: new Date("2026-03-10T10:00:00.000Z"),
        traderAddress,
        orderAddress: "0x123",
        creationTransactionHash: "0xtx",
        orderClassHash: "0xclass",
        sellTokenAddress: sellToken.address,
        sellAmount: 5000000n,
        sellAmountPerCycle: 1000000n,
        buyTokenAddress: buyToken.address,
        startDate: new Date("2026-03-10T10:00:00.000Z"),
        endDate: new Date("2026-03-15T10:00:00.000Z"),
        frequency: "P1D",
        iterations: 5,
        status: "ACTIVE" as const,
        pricingStrategy: {
          tokenToMinAmount: "0xa",
          tokenToMaxAmount: "0x14",
        },
        amountSold: 1000000n,
        amountBought: 200000000000000000n,
        averageAmountBought: 200000000000000000n,
        executedTradesCount: 1,
        cancelledTradesCount: 0,
        pendingTradesCount: 4,
        trades: [
          {
            sellAmount: 1000000n,
            sellAmountInUsd: 1,
            buyAmount: 200000000000000000n,
            buyAmountInUsd: 0.2,
            expectedTradeDate: new Date("2026-03-11T10:00:00.000Z"),
            actualTradeDate: new Date("2026-03-11T10:01:00.000Z"),
            status: "SUCCEEDED" as const,
            txHash: "0xtrade",
          },
        ],
      },
    ],
    totalPages: 1,
    totalElements: 1,
    size: 10,
    number: 0,
  };
}

describe("AvnuDcaProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    avnuMocks.getDcaOrders.mockReset();
    avnuMocks.createDcaToCalls.mockReset();
    avnuMocks.cancelDcaToCalls.mockReset();
  });

  it("supports mainnet and sepolia", () => {
    const provider = new AvnuDcaProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(true);
  });

  it("fetches orders and normalizes AVNU payloads", async () => {
    avnuMocks.getDcaOrders.mockResolvedValue(makeOrdersPage());

    const provider = new AvnuDcaProvider({
      apiBases: {
        SN_SEPOLIA: ["https://mock-sepolia.avnu.fi"],
      },
    });

    const page = await provider.getOrders(context, {
      traderAddress,
      status: "ACTIVE",
    });

    expect(avnuMocks.getDcaOrders).toHaveBeenCalledWith(
      {
        traderAddress,
        status: "ACTIVE",
      },
      { baseUrl: "https://mock-sepolia.avnu.fi" }
    );
    expect(page.content[0]).toMatchObject({
      providerId: "avnu",
      traderAddress,
      orderAddress: fromAddress("0x123"),
      sellAmountBase: 5000000n,
      sellAmountPerCycleBase: 1000000n,
      pricingStrategy: {
        minBuyAmountBase: 10n,
        maxBuyAmountBase: 20n,
      },
    });
    expect(page.content[0]?.trades[0]).toMatchObject({
      sellAmountBase: 1000000n,
      buyAmountBase: 200000000000000000n,
      txHash: "0xtrade",
    });
  });

  it("forwards optional pagination and sort params when provided", async () => {
    avnuMocks.getDcaOrders.mockResolvedValue(makeOrdersPage());

    const provider = new AvnuDcaProvider({
      apiBases: {
        SN_SEPOLIA: ["https://mock-sepolia.avnu.fi"],
      },
    });

    await provider.getOrders(context, {
      traderAddress,
      page: 2,
      size: 25,
      sort: "timestamp,desc",
    });

    expect(avnuMocks.getDcaOrders).toHaveBeenCalledWith(
      {
        traderAddress,
        page: 2,
        size: 25,
        sort: "timestamp,desc",
      },
      { baseUrl: "https://mock-sepolia.avnu.fi" }
    );
  });

  it("builds DCA creation calls and encodes amounts as hex", async () => {
    avnuMocks.createDcaToCalls.mockResolvedValue({
      chainId: "SN_SEPOLIA",
      calls: [
        {
          contractAddress: "0x555",
          entrypoint: "open_dca",
          calldata: [1, 2n, "0x3"],
        },
      ],
    });

    const provider = new AvnuDcaProvider({
      apiBases: {
        SN_SEPOLIA: ["https://mock-sepolia.avnu.fi"],
      },
    });
    const sellAmount = Amount.parse("5", sellToken);
    const sellAmountPerCycle = Amount.parse("1", sellToken);
    const minBuyAmount = Amount.parse("0.1", buyToken);

    const prepared = await provider.prepareCreate(context, {
      sellToken,
      buyToken,
      sellAmount,
      sellAmountPerCycle,
      frequency: "P1D",
      traderAddress,
      pricingStrategy: {
        minBuyAmount,
      },
    });

    expect(avnuMocks.createDcaToCalls).toHaveBeenCalledWith(
      {
        sellTokenAddress: sellToken.address,
        buyTokenAddress: buyToken.address,
        sellAmount: `0x${sellAmount.toBase().toString(16)}`,
        sellAmountPerCycle: `0x${sellAmountPerCycle.toBase().toString(16)}`,
        frequency: expect.objectContaining({ toJSON: expect.any(Function) }),
        pricingStrategy: {
          tokenToMinAmount: `0x${minBuyAmount.toBase().toString(16)}`,
          tokenToMaxAmount: undefined,
        },
        traderAddress,
      },
      { baseUrl: "https://mock-sepolia.avnu.fi" }
    );
    expect(prepared).toEqual({
      providerId: "avnu",
      action: "create",
      calls: [
        {
          contractAddress: "0x555",
          entrypoint: "open_dca",
          calldata: ["1", "2", "3"],
        },
      ],
    });
  });

  it("passes hour-based frequencies through to AVNU create requests", async () => {
    avnuMocks.createDcaToCalls.mockResolvedValue({
      chainId: "SN_SEPOLIA",
      calls: [
        {
          contractAddress: "0x555",
          entrypoint: "open_dca",
          calldata: [1, 2n, "0x3"],
        },
      ],
    });

    const provider = new AvnuDcaProvider({
      apiBases: {
        SN_SEPOLIA: ["https://mock-sepolia.avnu.fi"],
      },
    });

    await provider.prepareCreate(context, {
      sellToken,
      buyToken,
      sellAmount: Amount.parse("5", sellToken),
      sellAmountPerCycle: Amount.parse("1", sellToken),
      frequency: "PT1H",
      traderAddress,
    });

    const request = avnuMocks.createDcaToCalls.mock.calls[0]?.[0];
    expect(request?.frequency.toJSON()).toBe("PT1H");
    expect(request?.frequency.toISOString()).toBe("PT1H");
  });

  it("falls back to the second sepolia endpoint when the first create attempt fails", async () => {
    avnuMocks.createDcaToCalls
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        chainId: "SN_SEPOLIA",
        calls: [
          {
            contractAddress: "0x777",
            entrypoint: "open_dca",
            calldata: [],
          },
        ],
      });

    const provider = new AvnuDcaProvider();

    await provider.prepareCreate(context, {
      sellToken,
      buyToken,
      sellAmount: Amount.parse("2", sellToken),
      sellAmountPerCycle: Amount.parse("1", sellToken),
      frequency: "P1D",
      traderAddress,
    });

    expect(avnuMocks.createDcaToCalls).toHaveBeenCalledTimes(2);
    expect(avnuMocks.createDcaToCalls.mock.calls[0]![1]).toEqual({
      baseUrl: "https://sepolia.api.avnu.fi",
    });
    expect(avnuMocks.createDcaToCalls.mock.calls[1]![1]).toEqual({
      baseUrl: "https://starknet.api.avnu.fi",
    });
  });

  it("validates amount relationships before calling AVNU", async () => {
    const provider = new AvnuDcaProvider();

    await expect(
      provider.prepareCreate(context, {
        sellToken,
        buyToken,
        sellAmount: Amount.parse("1", sellToken),
        sellAmountPerCycle: Amount.parse("2", sellToken),
        frequency: "P1D",
        traderAddress,
      })
    ).rejects.toThrow("DCA sellAmountPerCycle cannot exceed sellAmount");

    expect(avnuMocks.createDcaToCalls).not.toHaveBeenCalled();
  });

  it("normalizes cancel calls", async () => {
    avnuMocks.cancelDcaToCalls.mockResolvedValue({
      chainId: "SN_SEPOLIA",
      calls: [
        {
          contractAddress: "0x888",
          entrypoint: "cancel",
          calldata: [0, 1],
        },
      ],
    });

    const provider = new AvnuDcaProvider({
      apiBases: {
        SN_SEPOLIA: ["https://mock-sepolia.avnu.fi"],
      },
    });

    const prepared = await provider.prepareCancel(context, {
      orderAddress: fromAddress("0x123"),
    });

    expect(prepared).toEqual({
      providerId: "avnu",
      action: "cancel",
      orderAddress: fromAddress("0x123"),
      calls: [
        {
          contractAddress: "0x888",
          entrypoint: "cancel",
          calldata: ["0", "1"],
        },
      ],
    });
  });
});
