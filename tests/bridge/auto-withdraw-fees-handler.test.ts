import { beforeEach, describe, expect, it, vi } from "vitest";
import { Erc20 } from "@/erc20";
import {
  fromAddress,
  Amount,
  ChainId,
  type Address,
  type Token,
} from "@/types";
import { EthereumBridgeToken } from "@/types/bridge/bridge-token";
import { Protocol } from "@/types/bridge/protocol";
import { AutoWithdrawFeesHandler } from "@/bridge/utils/auto-withdraw-fees-handler";
import type { RpcProvider } from "starknet";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STRK_ADDRESS = fromAddress(
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
);
const ETH_ADDRESS = fromAddress(
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
);
const RELAYER_ADDRESS = fromAddress(
  "0x051ba9be967d17aaafac92f9bc7ca4b035dfd3c4a97b32be1773f63e27b0526a"
);
const BRIDGE_ADDRESS = fromAddress(
  "0x0594c1582459ea03f77deaf9eb7e3917d6994a03c13405ba42867f83d85f085d"
);

const mockStrkToken: Token = {
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  address: STRK_ADDRESS,
};

const mockEthToken: Token = {
  name: "Ethereum",
  symbol: "ETH",
  decimals: 18,
  address: ETH_ADDRESS,
};

const mockBridgeToken = new EthereumBridgeToken({
  id: "strk",
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  protocol: Protocol.CANONICAL,
  address: "0xL1TokenAddress" as Address & {
    readonly __type: "EthereumAddress";
  },
  l1Bridge: "0xL1BridgeAddress" as Address & {
    readonly __type: "EthereumAddress";
  },
  starknetAddress: STRK_ADDRESS,
  starknetBridge: BRIDGE_ADDRESS,
  supportsAutoWithdraw: false,
});

const mockProvider = {} as RpcProvider;
const WALLET_ADDRESS = fromAddress(
  "0x0234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGasCostResponse(gasCosts: Record<string, string>) {
  return {
    status: "ok",
    message: "success",
    result: {
      gasCost: gasCosts,
      timestamp: 1774346148,
      bridge: BRIDGE_ADDRESS,
      relayerAddress: RELAYER_ADDRESS,
    },
  };
}

function makeFetchFn(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: () => Promise.resolve(body),
  });
}

function makeErc20Mock(token: Token, balanceRaw: bigint) {
  return {
    token,
    balanceOf: vi.fn().mockResolvedValue(Amount.fromRaw(balanceRaw, token)),
  } as unknown as Erc20;
}

const INSUFFICIENT_AUTO_WITHDRAW_BALANCE =
  "The user has no sufficient balance to cover for auto-withdraw.";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AutoWithdrawFeesHandler", () => {
  let fromAddressSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fromAddressSpy = vi.spyOn(Erc20, "fromAddress");
  });

  describe("fetchAutoWithdrawData (via getFeeData)", () => {
    it("requests the sepolia URL for SN_SEPOLIA", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: "120000000000000" })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, 200000000000000n)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      const calledUrl = new URL(fetchFn.mock.calls[0]![0] as string);
      expect(calledUrl.origin + calledUrl.pathname).toBe(
        "https://starkgate-sepolia.spaceshard.io/v2/gas-cost"
      );
    });

    it("requests the mainnet URL for SN_MAIN", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: "120000000000000" })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, 200000000000000n)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.MAINNET,
        provider: mockProvider,
        fetchFn,
      });

      await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      const calledUrl = new URL(fetchFn.mock.calls[0]![0] as string);
      expect(calledUrl.origin + calledUrl.pathname).toBe(
        "https://starkgate.spaceshard.io/v2/gas-cost"
      );
    });

    it("sends the bridge address lowercased as a query param", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: "120000000000000" })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, 200000000000000n)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      const calledUrl = new URL(fetchFn.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("bridge")).toBe(
        BRIDGE_ADDRESS.toLowerCase()
      );
    });

    it("sends the timestamp as unix seconds from the now() option", async () => {
      const fixedNow = 1_774_346_148_000; // ms
      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: "120000000000000" })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, 200000000000000n)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
        now: () => fixedNow,
      });

      await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      const calledUrl = new URL(fetchFn.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("timestamp")).toBe(
        String(Math.floor(fixedNow / 1000))
      );
    });

    it("throws the API error message on a non-ok response", async () => {
      const fetchFn = makeFetchFn(
        {
          statusCode: 400,
          message: "Bridge not supported: { bridge: '1' }",
          error: "Bad Request",
        },
        false,
        400
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await expect(
        handler.getFeeData({
          bridgeToken: mockBridgeToken,
          amount: Amount.fromRaw(0n, mockStrkToken),
          walletOrAddress: WALLET_ADDRESS,
          preferredFeeToken: undefined,
        })
      ).rejects.toThrow("Bridge not supported: { bridge: '1' }");
    });

    it("throws a fallback message on non-ok response without a message field", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({ error: "oops" }),
      });

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await expect(
        handler.getFeeData({
          bridgeToken: mockBridgeToken,
          amount: Amount.fromRaw(0n, mockStrkToken),
          walletOrAddress: WALLET_ADDRESS,
          preferredFeeToken: undefined,
        })
      ).rejects.toThrow(
        "Auto-withdraw gas cost request failed: 500 Internal Server Error"
      );
    });
  });

  describe("getFeeData", () => {
    it("returns the relayer address from the API response", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: "120000000000000" })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, 200000000000000n)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      const result = await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      expect(result.relayerAddress).toBe(RELAYER_ADDRESS);
    });

    it("includes fee tokens whose balance covers the gas cost", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({
          [STRK_ADDRESS]: "120000000000000",
          [ETH_ADDRESS]: "5000000000000",
        })
      );
      fromAddressSpy
        .mockResolvedValueOnce(makeErc20Mock(mockStrkToken, 200000000000000n)) // enough
        .mockResolvedValueOnce(makeErc20Mock(mockEthToken, 10000000000000n)); // enough

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      const result = await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      expect(result.costsPerToken.size).toBe(2);
      expect(result.preselectedGasToken.tokenAddress).toBe(STRK_ADDRESS);
    });

    it("excludes fee tokens whose balance is below the gas cost", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({
          [STRK_ADDRESS]: "120000000000000",
          [ETH_ADDRESS]: "5000000000000",
        })
      );
      fromAddressSpy
        .mockResolvedValueOnce(makeErc20Mock(mockStrkToken, 200000000000000n)) // enough
        .mockResolvedValueOnce(makeErc20Mock(mockEthToken, 1000000000000n)); // not enough

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      const result = await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      expect(result.costsPerToken.size).toBe(1);
      const [token] = result.costsPerToken.keys();
      expect(token!.symbol).toBe("STRK");
    });

    it("accounts for the withdrawal amount when the fee token is the bridge token", async () => {
      // STRK is both the fee token and the bridged token.
      // Balance: 200, withdrawal amount: 150, gas cost: 120 → effective balance 50 < 120 → excluded.
      const gasCostRaw = 120_000_000_000_000n;
      const withdrawalRaw = 150_000_000_000_000n;
      const balanceRaw = 200_000_000_000_000n;

      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: gasCostRaw.toString() })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, balanceRaw)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await expect(
        handler.getFeeData({
          bridgeToken: mockBridgeToken,
          amount: Amount.fromRaw(withdrawalRaw, mockStrkToken),
          walletOrAddress: WALLET_ADDRESS,
          preferredFeeToken: undefined,
        })
      ).rejects.toThrow(INSUFFICIENT_AUTO_WITHDRAW_BALANCE);
    });

    it("includes the bridge token as a fee token when remaining balance covers the gas cost", async () => {
      // Balance: 300, withdrawal: 100, gas cost: 120 → effective balance 200 >= 120 → included.
      const gasCostRaw = 120_000_000_000_000n;
      const withdrawalRaw = 100_000_000_000_000n;
      const balanceRaw = 300_000_000_000_000n;

      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: gasCostRaw.toString() })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, balanceRaw)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      const result = await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(withdrawalRaw, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      expect(result.costsPerToken.size).toBe(1);
      const [token, cost] = [...result.costsPerToken][0]!;
      expect(token.symbol).toBe("STRK");
      expect(cost.toBase()).toBe(gasCostRaw);
    });

    it("skips the bridge token as a fee token when balance is less than the withdrawal amount", async () => {
      // Balance < withdrawal amount → skip entirely (can't even cover the withdrawal).
      const gasCostRaw = 50_000_000_000_000n;
      const withdrawalRaw = 200_000_000_000_000n;
      const balanceRaw = 100_000_000_000_000n;

      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: gasCostRaw.toString() })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, balanceRaw)
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await expect(
        handler.getFeeData({
          bridgeToken: mockBridgeToken,
          amount: Amount.fromRaw(withdrawalRaw, mockStrkToken),
          walletOrAddress: WALLET_ADDRESS,
          preferredFeeToken: undefined,
        })
      ).rejects.toThrow(INSUFFICIENT_AUTO_WITHDRAW_BALANCE);
    });

    it("throws when no fee token can cover the gas cost", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({ [STRK_ADDRESS]: "120000000000000" })
      );
      fromAddressSpy.mockResolvedValue(
        makeErc20Mock(mockStrkToken, 1n) // far too low
      );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await expect(
        handler.getFeeData({
          bridgeToken: mockBridgeToken,
          amount: Amount.fromRaw(0n, mockStrkToken),
          walletOrAddress: WALLET_ADDRESS,
          preferredFeeToken: undefined,
        })
      ).rejects.toThrow(INSUFFICIENT_AUTO_WITHDRAW_BALANCE);
    });

    it("selects the preferred fee token when it is affordable", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({
          [STRK_ADDRESS]: "120000000000000",
          [ETH_ADDRESS]: "5000000000000",
        })
      );
      fromAddressSpy
        .mockResolvedValueOnce(makeErc20Mock(mockStrkToken, 200000000000000n))
        .mockResolvedValueOnce(makeErc20Mock(mockEthToken, 10000000000000n));

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      const result = await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: mockEthToken,
      });

      expect(result.preselectedGasToken.tokenAddress).toBe(ETH_ADDRESS);
      expect(result.costsPerToken.size).toBe(2);
    });

    it("falls back to the first affordable token when the preferred token is not affordable", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({
          [STRK_ADDRESS]: "120000000000000",
          [ETH_ADDRESS]: "5000000000000",
        })
      );
      fromAddressSpy
        .mockResolvedValueOnce(
          makeErc20Mock(mockStrkToken, 1000000000000n) // not enough for STRK gas
        )
        .mockResolvedValueOnce(
          makeErc20Mock(mockEthToken, 10000000000000n) // enough for ETH gas
        );

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      const result = await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: mockStrkToken,
      });

      expect(result.preselectedGasToken.tokenAddress).toBe(ETH_ADDRESS);
      expect(result.costsPerToken.size).toBe(1);
    });

    it("calls Erc20.fromAddress with each fee token address and the configured provider", async () => {
      const fetchFn = makeFetchFn(
        makeGasCostResponse({
          [STRK_ADDRESS]: "120000000000000",
          [ETH_ADDRESS]: "5000000000000",
        })
      );
      fromAddressSpy
        .mockResolvedValueOnce(makeErc20Mock(mockStrkToken, 200000000000000n))
        .mockResolvedValueOnce(makeErc20Mock(mockEthToken, 10000000000000n));

      const handler = new AutoWithdrawFeesHandler({
        chainId: ChainId.SEPOLIA,
        provider: mockProvider,
        fetchFn,
      });

      await handler.getFeeData({
        bridgeToken: mockBridgeToken,
        amount: Amount.fromRaw(0n, mockStrkToken),
        walletOrAddress: WALLET_ADDRESS,
        preferredFeeToken: undefined,
      });

      expect(fromAddressSpy).toHaveBeenCalledTimes(2);
      expect(fromAddressSpy).toHaveBeenCalledWith(STRK_ADDRESS, mockProvider);
      expect(fromAddressSpy).toHaveBeenCalledWith(ETH_ADDRESS, mockProvider);
    });
  });
});
