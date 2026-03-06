import { describe, expect, it, vi, beforeEach } from "vitest";
import { Chainrails, crapi } from "@chainrails/sdk";
import { Payment } from "@/payment/payment";
import type {
  PaymentConfig,
  PaymentIntent,
  PaymentQuote,
  PaymentClientInfo,
} from "@/payment/types";
import {
  PaymentChains,
  PaymentTokenSymbols,
  PaymentBridges,
} from "@/payment/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_CONFIG: PaymentConfig = {
  apiKey: "cr_test_abc123",
  environment: "staging",
};

const MOCK_INTENT: PaymentIntent = {
  id: 1,
  client_id: "client_1",
  sender: "0xaaa",
  recipient: "0xbbb",
  refund_address: "0xaaa",
  initialAmount: "10000000",
  fees_in_usd: "0.10",
  app_fee_in_usd: "0.05",
  total_amount_in_usd: "10.15",
  total_amount_in_asset_token: "10150000",
  fees_in_asset_token: "100000",
  app_fee_in_asset_token: "50000",
  asset_token_symbol: "USDC",
  asset_token_decimals: 6,
  slippage: "0.005",
  tokenIn: "0xtokenin",
  tokenOut: "0xtokenout",
  source_chain: "BASE_MAINNET",
  destination_chain: "STARKNET_MAINNET",
  intent_address: "0xintent",
  destination_intent_address: "0xdest_intent",
  intent_nonce: 1,
  intent_status: "PENDING",
  coordinator: "0xcoord",
  bridger: "ACROSS",
  bridgeExtraData: "0x",
  relayer: "0xrelayer",
  relayer_claimed: false,
  needs_relay: true,
  paymaster_used: false,
  mode: "standard",
  tx_hash: null,
  expires_at: "2026-03-01T00:00:00Z",
  created_at: "2026-02-25T00:00:00Z",
  updated_at: "2026-02-25T00:00:00Z",
  metadata: { reference: "order-42", description: "Test order" },
};

const MOCK_QUOTE: PaymentQuote = {
  sourceChain: "BASE_MAINNET",
  destinationChain: "STARKNET_MAINNET",
  totalFee: "100000",
  totalFeeFormatted: "0.10",
  bridge: "ACROSS",
  paymentOptions: [
    {
      token: "USDC",
      depositAmount: "10100000",
      depositAmountFormatted: "10.10",
      fee: "100000",
      feeFormatted: "0.10",
      slippage: 0.005,
    },
  ],
};

// ─── Constants ──────────────────────────────────────────────────────────────

describe("Payment constants", () => {
  it("PaymentChains has all expected chains", () => {
    expect(PaymentChains.STARKNET).toBe("STARKNET");
    expect(PaymentChains.BASE).toBe("BASE");
    expect(PaymentChains.ETHEREUM).toBe("ETHEREUM");
    expect(Object.keys(PaymentChains).length).toBeGreaterThanOrEqual(18);
  });

  it("PaymentTokenSymbols has standard tokens", () => {
    expect(PaymentTokenSymbols.USDC).toBe("USDC");
    expect(PaymentTokenSymbols.USDT).toBe("USDT");
    expect(PaymentTokenSymbols.ETH).toBe("ETH");
    expect(PaymentTokenSymbols.STRK).toBe("STRK");
  });

  it("PaymentBridges has known bridges", () => {
    expect(PaymentBridges.ACROSS).toBe("ACROSS");
    expect(PaymentBridges.CCTP).toBe("CCTP");
    expect(PaymentBridges.GATEWAY).toBe("GATEWAY");
    expect(PaymentBridges.RHINOFI).toBe("RHINOFI");
  });
});

// ─── Payment class ──────────────────────────────────────────────────────────

describe("Payment", () => {
  let payment: Payment;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Chainrails, "config").mockResolvedValue({} as never);
    payment = new Payment(TEST_CONFIG);
  });

  // ── Sessions ────────────────────────────────────────────────────────────

  describe("createSession", () => {
    it("posts to modal/sessions with internal chain", async () => {
      const sessionSpy = vi
        .spyOn(crapi.auth, "getSessionToken")
        .mockResolvedValue({
          sessionToken: "tok_123",
          amount: "25.00",
        } as never);

      const result = await payment.createSession({
        recipient: "0xrecipient",
        token: "USDC",
        destinationChain: "STARKNET",
        amount: "25.00",
      });

      expect(sessionSpy).toHaveBeenCalledWith({
        recipient: "0xrecipient",
        token: "USDC",
        destinationChain: "STARKNET",
        amount: "25.00",
      });
      expect(result.sessionToken).toBe("tok_123");
      expect(result.amount).toBe("25.00");
    });
  });

  describe("modal", () => {
    it("returns a simple modal handle with pay() for web platform", () => {
      const flow = payment.modal({
        platform: "web",
        sessionToken: "tok_123",
        amount: "25.00",
      });

      expect(flow.platform).toBe("web");
      expect(flow.sessionToken).toBe("tok_123");
      expect(flow.amount).toBe("25.00");
      expect(typeof flow.pay).toBe("function");
    });

    it("defaults platform to web when not specified", () => {
      const flow = payment.modal({
        sessionToken: "tok_default",
      });

      expect(flow.platform).toBe("web");
      expect(flow.sessionToken).toBe("tok_default");
      expect(flow.amount).toBeUndefined();
    });
  });

  // ── Quotes ──────────────────────────────────────────────────────────────

  describe("getAllQuotes", () => {
    it("fetches multi-source quotes with internal chain", async () => {
      const mockOutput = {
        destinationChain: "STARKNET",
        quotes: [MOCK_QUOTE],
        cheapestOption: MOCK_QUOTE,
      };
      const getAllSpy = vi
        .spyOn(crapi.quotes, "getAll")
        .mockResolvedValue(mockOutput as never);

      const result = await payment.getAllQuotes({
        destinationChain: "STARKNET",
        tokenOut: "0x053c91",
        amount: "10",
        recipient: "0xabc",
      });

      expect(getAllSpy).toHaveBeenCalledWith(
        expect.objectContaining({ destinationChain: "STARKNET" })
      );
      expect(result.quotes).toHaveLength(1);
    });
  });

  describe("getBestQuote", () => {
    it("fetches best quote across bridges", async () => {
      const bestSpy = vi
        .spyOn(crapi.quotes, "getBestAcrossBridges")
        .mockResolvedValue({ totalFee: "100000" } as never);

      await payment.getBestQuote({
        sourceChain: "BASE",
        destinationChain: "STARKNET",
        tokenIn: "0xtoken",
        tokenOut: "0xtoken2",
        amount: "10",
        recipient: "0xrecipient",
        amountSymbol: "USDC",
      });

      expect(bestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceChain: "BASE",
          destinationChain: "STARKNET",
        })
      );
    });
  });

  describe("getQuoteFromBridge", () => {
    it("fetches single bridge quote", async () => {
      const singleSpy = vi
        .spyOn(crapi.quotes, "getFromSpecificBridge")
        .mockResolvedValue({ quotes: [] } as never);

      await payment.getQuoteFromBridge({
        sourceChain: "ETHEREUM",
        destinationChain: "STARKNET",
        tokenIn: "0xtoken",
        tokenOut: "0xtoken2",
        amount: "50",
        bridge: "CCTP",
        recipient: "0xrecipient",
      });

      expect(singleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceChain: "ETHEREUM",
          destinationChain: "STARKNET",
          bridge: "CCTP",
        })
      );
    });
  });

  // ── Intents ─────────────────────────────────────────────────────────────

  describe("createIntent", () => {
    it("posts with internal chain names", async () => {
      const createSpy = vi
        .spyOn(crapi.intents, "create")
        .mockResolvedValue(MOCK_INTENT as never);

      const result = await payment.createIntent({
        sender: "0xsender",
        amount: "10",
        tokenIn: "0xtokenin",
        amountSymbol: "USDC",
        source_chain: "BASE",
        destination_chain: "STARKNET",
        recipient: "0xrecipient",
        refund_address: "0xsender",
        metadata: { description: "Test", reference: "ref-1" },
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source_chain: "BASE",
          destination_chain: "STARKNET",
        })
      );
      expect(result.id).toBe(1);
    });
  });

  describe("getIntent", () => {
    it("fetches intent by ID", async () => {
      const getByIdSpy = vi
        .spyOn(crapi.intents, "getById")
        .mockResolvedValue(MOCK_INTENT as never);

      const result = await payment.getIntent("42");

      expect(getByIdSpy).toHaveBeenCalledWith("42");
      expect(result.intent_status).toBe("PENDING");
    });
  });

  describe("getIntentsForSender", () => {
    it("fetches intents for a sender", async () => {
      const getForSenderSpy = vi
        .spyOn(crapi.intents, "getForSender")
        .mockResolvedValue([MOCK_INTENT] as never);

      const result = await payment.getIntentsForSender("0xsender");

      expect(getForSenderSpy).toHaveBeenCalledWith("0xsender");
      expect(result).toHaveLength(1);
    });
  });

  describe("listIntents", () => {
    it("lists with pagination", async () => {
      const output = {
        intents: [MOCK_INTENT],
        total: "1" as const,
        limit: 10,
        offset: 0,
      };
      const getAllSpy = vi
        .spyOn(crapi.intents, "getAll")
        .mockResolvedValue(output as never);

      const result = await payment.listIntents({ limit: 10, offset: 0 });

      expect(getAllSpy).toHaveBeenCalledWith({ limit: 10, offset: 0 });
      expect(result.intents).toHaveLength(1);
    });
  });

  describe("triggerProcessing", () => {
    it("triggers processing for an intent address", async () => {
      const triggerSpy = vi
        .spyOn(crapi.intents, "triggerProcessing")
        .mockResolvedValue({ success: true, message: "ok" } as never);

      const result = await payment.triggerProcessing("0xintent");

      expect(triggerSpy).toHaveBeenCalledWith("0xintent");
      expect(result.success).toBe(true);
    });
  });

  // ── Router ──────────────────────────────────────────────────────────────

  describe("getOptimalRoute", () => {
    it("fetches optimal route with internal chains", async () => {
      const optimalSpy = vi
        .spyOn(crapi.router, "getOptimalRoutes")
        .mockResolvedValue({ bridgeToUse: "ACROSS" } as never);

      await payment.getOptimalRoute({
        sourceChain: "ARBITRUM",
        destinationChain: "STARKNET",
        tokenIn: "0xin",
        tokenOut: "0xout",
        amount: "100",
        amountSymbol: "USDC",
      });

      expect(optimalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceChain: "ARBITRUM",
          destinationChain: "STARKNET",
        })
      );
    });
  });

  describe("getAllSupportedBridges", () => {
    it("fetches all bridges", async () => {
      const allBridgesSpy = vi
        .spyOn(crapi.router, "getAllSupportedBridges")
        .mockResolvedValue({
          bridges: {},
          metadata: { totalBridges: 4, totalRoutes: 20, lastUpdated: "" },
        } as never);

      const result = await payment.getAllSupportedBridges();

      expect(allBridgesSpy).toHaveBeenCalled();
      expect(result.metadata.totalBridges).toBe(4);
    });
  });

  describe("getSupportedBridges", () => {
    it("fetches bridges for a route", async () => {
      const supportedSpy = vi
        .spyOn(crapi.router, "getSupportedBridges")
        .mockResolvedValue({ supportedBridges: ["ACROSS", "CCTP"] } as never);

      const result = await payment.getSupportedBridges({
        sourceChain: "BASE",
        destinationChain: "STARKNET",
      });

      expect(supportedSpy).toHaveBeenCalledWith({
        sourceChain: "BASE",
        destinationChain: "STARKNET",
      });
      expect(result.supportedBridges).toContain("ACROSS");
    });
  });

  // ── Chains ──────────────────────────────────────────────────────────────

  describe("getSupportedChains", () => {
    it("fetches supported chains", async () => {
      const chainsSpy = vi
        .spyOn(crapi.chains, "getSupported")
        .mockResolvedValue(["STARKNET_MAINNET", "BASE_MAINNET"] as never);

      const result = await payment.getSupportedChains();

      expect(chainsSpy).toHaveBeenCalledWith(undefined);
      expect(result).toContain("STARKNET_MAINNET");
    });

    it("filters by network", async () => {
      const chainsSpy = vi
        .spyOn(crapi.chains, "getSupported")
        .mockResolvedValue(["STARKNET_TESTNET"] as never);

      await payment.getSupportedChains({ network: "testnet" });

      expect(chainsSpy).toHaveBeenCalledWith({ network: "testnet" });
    });
  });

  describe("getBalance", () => {
    it("fetches balance for an address", async () => {
      const balanceSpy = vi
        .spyOn(crapi.chains, "getBalance")
        .mockResolvedValue("1000000" as never);

      const result = await payment.getBalance({
        address: "0xwallet",
        network: "mainnet",
      });

      expect(balanceSpy).toHaveBeenCalledWith({
        address: "0xwallet",
        includeZeroBalances: undefined,
        network: "mainnet",
        chainType: undefined,
      });
      expect(result).toBe("1000000");
    });
  });

  // ── Client Info ─────────────────────────────────────────────────────────

  describe("getClientInfo", () => {
    it("fetches merchant client info", async () => {
      const info: PaymentClientInfo = {
        id: "cl_1",
        name: "Test Merchant",
        email: "test@example.com",
        logoUrl: "https://example.com/logo.png",
        createdAt: "2026-01-01",
        paymasterBalance: "100.00",
        paymasterEnabled: true,
      };
      const clientInfoSpy = vi
        .spyOn(crapi.client, "getClientInfo")
        .mockResolvedValue(info as never);

      const result = await payment.getClientInfo();

      expect(clientInfoSpy).toHaveBeenCalled();
      expect(result.name).toBe("Test Merchant");
    });
  });
});

// ─── SDK integration ────────────────────────────────────────────────────────

describe("StarkZap.payment()", () => {
  it("throws when payment config is missing in non-browser runtimes", async () => {
    // Dynamically import to avoid circular issues
    const { StarkZap } = await import("@/sdk");

    const sdk = new StarkZap({ network: "mainnet" });

    expect(() => sdk.payment()).toThrow(/Payment is not configured/);
  });

  it("does not throw when payment config is missing in browser runtimes", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { createElement: () => ({}) });

    const { StarkZap } = await import("@/sdk");
    const sdk = new StarkZap({ network: "mainnet" });

    expect(() => sdk.payment()).not.toThrow();

    vi.unstubAllGlobals();
  });

  it("returns a Payment instance when configured", async () => {
    const { StarkZap } = await import("@/sdk");

    const sdk = new StarkZap({
      network: "mainnet",
      payment: { apiKey: "cr_test_key" },
    });

    const p = sdk.payment();
    expect(p).toBeInstanceOf(Payment);
  });
});
