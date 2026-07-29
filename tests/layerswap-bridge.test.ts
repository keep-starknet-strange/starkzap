/**
 * Layerswap Bridge Integration Test
 *
 * Tests the Layerswap bridge provider end-to-end:
 * - Token discovery via mocked StarkGate API (including layerswap protocol)
 * - Quote and fee estimation via real Layerswap API
 * - Swap creation via real Layerswap API
 *
 * Run with:
 *   LAYERSWAP_API_KEY="your-key" RUN_LAYERSWAP_LIVE_TESTS=true \
 *     npx vitest run tests/layerswap-bridge.test.ts
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BridgeTokenRepository } from "@/bridge/tokens/repository";
import { LayerswapApi } from "@/bridge/ethereum/layerswap/LayerswapApi";
import { LayerswapBridge } from "@/bridge/ethereum/layerswap/LayerswapBridge";
import {
  EthereumBridgeToken,
  ExternalChain,
  Protocol,
  ChainId,
  fromAddress,
} from "@/types";
import type { EthereumAddress } from "@/types";
import type {
  LayerswapTokenSource,
  LsRoute,
  LsToken,
} from "@/bridge/ethereum/layerswap/types";
import type { WalletInterface } from "@/wallet";
import type { EthereumWalletConfig } from "@/bridge/ethereum/ethers-interop";
import { NOOP_LOGGER } from "@/logger";

const API_KEY = process.env["LAYERSWAP_API_KEY"] ?? "";
const hasApiKey = API_KEY.length > 0;
const runLayerswapLiveTests =
  process.env["RUN_LAYERSWAP_LIVE_TESTS"] === "true";
const skipLive = !(hasApiKey && runLayerswapLiveTests);

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// Mock StarkGate API response including a layerswap token
// ============================================================

function mockApiResponseWithLayerswap() {
  return [
    {
      id: "eth-canonical",
      chain: "ethereum",
      protocol: "canonical",
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
      l2_token_address:
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      l1_token_address: "0x0000000000000000000000000000000000000000",
      l1_bridge_address: "0x1111111111111111111111111111111111111111",
      l2_bridge_address:
        "0x073314940630fd6dcda0d772d4c972c4e0a9946bef9dabf4ef84eda8ef542b82",
    },
    {
      id: "eth-layerswap",
      chain: "ethereum",
      protocol: "layerswap",
      name: "Ethereum (Layerswap)",
      symbol: "ETH",
      decimals: 18,
      l2_token_address:
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      l1_token_address: "0x0000000000000000000000000000000000000000",
      l1_bridge_address: "0x0000000000000000000000000000000000000000",
      l2_bridge_address:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
    {
      id: "usdc-layerswap",
      chain: "ethereum",
      protocol: "layerswap",
      name: "USDC (Layerswap)",
      symbol: "USDC",
      decimals: 6,
      l2_token_address:
        "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
      l1_token_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      l1_bridge_address: "0x0000000000000000000000000000000000000000",
      l2_bridge_address:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  ];
}

// ============================================================
// 1. Token discovery — BridgeTokenRepository parses layerswap
// ============================================================

describe("Layerswap token discovery", () => {
  function lsToken(overrides: Partial<LsToken> & { symbol: string }): LsToken {
    return {
      logo: "https://example.com/logo.png",
      contract: null,
      decimals: 18,
      price_in_usd: 0,
      precision: 6,
      listing_date: "2024-01-01T00:00:00Z",
      ...overrides,
    };
  }

  function lsRoute(name: string, tokens: LsToken[]): LsRoute {
    return {
      name,
      display_name: name,
      logo: "https://example.com/network.png",
      chain_id: "1",
      type: "evm",
      transaction_explorer_template: "https://example.com/tx/{0}",
      account_explorer_template: "https://example.com/account/{0}",
      tokens,
    };
  }

  it("discovers layerswap tokens from the Layerswap API and ignores StarkGate layerswap rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => mockApiResponseWithLayerswap(),
    });

    const layerswapApi: LayerswapTokenSource = {
      getSources: vi.fn().mockResolvedValue([
        lsRoute("ETHEREUM_MAINNET", [
          lsToken({ symbol: "ETH", contract: null, decimals: 18 }),
          lsToken({
            symbol: "USDC",
            contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            decimals: 6,
          }),
        ]),
      ]),
      getDestinations: vi.fn().mockResolvedValue([
        lsRoute("STARKNET_MAINNET", [
          lsToken({
            symbol: "ETH",
            contract:
              "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
          }),
          lsToken({
            symbol: "USDC",
            contract:
              "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
            decimals: 6,
          }),
        ]),
      ]),
    };

    const repository = new BridgeTokenRepository({
      fetchFn: fetchMock as unknown as typeof fetch,
      layerswapOptions: layerswapApi,
    });
    const tokens = await repository.getTokens({
      chain: ExternalChain.ETHEREUM,
    });

    const layerswapTokens = tokens.filter(
      (t) => t.protocol === Protocol.LAYERSWAP
    );

    expect(layerswapTokens).toHaveLength(2);
    expect(layerswapTokens[0]).toBeInstanceOf(EthereumBridgeToken);
    expect(layerswapTokens[0]!.chain).toBe(ExternalChain.ETHEREUM);
    expect(layerswapTokens[0]!.protocol).toBe(Protocol.LAYERSWAP);
    expect(layerswapTokens.map((t) => t.symbol).sort()).toEqual([
      "ETH",
      "USDC",
    ]);

    // The Layerswap API is the sole source of layerswap tokens: the StarkGate
    // rows (ids "eth-layerswap"/"usdc-layerswap") are ignored in favor of the
    // discovered, chain-qualified tokens.
    expect(layerswapTokens.map((t) => t.id).sort()).toEqual([
      "eth-ethereum-layerswap",
      "usdc-ethereum-layerswap",
    ]);

    // Canonical token should still be present
    const canonicalTokens = tokens.filter(
      (t) => t.protocol === Protocol.CANONICAL
    );
    expect(canonicalTokens).toHaveLength(1);
  });
});

// ============================================================
// 2. Layerswap API — real API calls (requires API key)
// ============================================================

describe("Layerswap API (live)", () => {
  it.skipIf(skipLive)(
    "should fetch available source networks for Starknet Sepolia",
    async () => {
      const api = new LayerswapApi({ apiKey: API_KEY });
      const sources = await api.getSources({
        destinationNetwork: "STARKNET_SEPOLIA",
      });

      console.log(
        "Available sources for STARKNET_SEPOLIA:",
        sources.map(
          (s) => `${s.name} (${s.tokens.map((t) => t.symbol).join(", ")})`
        )
      );

      expect(sources.length).toBeGreaterThan(0);
      // Ethereum Sepolia should be among the sources
      const ethSource = sources.find(
        (s) => s.name.includes("ETHEREUM") || s.name.includes("SEPOLIA")
      );
      console.log("Ethereum source:", ethSource);
    }
  );

  it.skipIf(skipLive)(
    "should fetch available destination networks from Ethereum Sepolia",
    async () => {
      const api = new LayerswapApi({ apiKey: API_KEY });
      const destinations = await api.getDestinations({
        sourceNetwork: "ETHEREUM_SEPOLIA",
      });

      console.log(
        "Available destinations from ETHEREUM_SEPOLIA:",
        destinations.map(
          (d) => `${d.name} (${d.tokens.map((t) => t.symbol).join(", ")})`
        )
      );

      expect(destinations.length).toBeGreaterThan(0);
    }
  );

  it.skipIf(skipLive)(
    "should get a quote for ETH from Ethereum Sepolia to Starknet Sepolia",
    async () => {
      const api = new LayerswapApi({ apiKey: API_KEY });

      const quote = await api.getQuote({
        sourceNetwork: "ETHEREUM_SEPOLIA",
        sourceToken: "ETH",
        destinationNetwork: "STARKNET_SEPOLIA",
        destinationToken: "ETH",
        amount: 0.01,
      });

      console.log("Quote:", {
        receiveAmount: quote.receive_amount,
        totalFee: quote.total_fee,
        blockchainFee: quote.blockchain_fee,
        serviceFee: quote.service_fee,
        avgCompletionTime: quote.avg_completion_time,
      });

      expect(quote.receive_amount).toBeGreaterThan(0);
      expect(quote.total_fee).toBeGreaterThanOrEqual(0);
    }
  );

  it.skipIf(skipLive)("should get limits for ETH route", async () => {
    const api = new LayerswapApi({ apiKey: API_KEY });

    const limits = await api.getLimits({
      sourceNetwork: "ETHEREUM_SEPOLIA",
      sourceToken: "ETH",
      destinationNetwork: "STARKNET_SEPOLIA",
      destinationToken: "ETH",
      amount: 0.01,
    });

    console.log("Limits:", limits);

    expect(limits.min_amount).toBeGreaterThan(0);
    expect(limits.max_amount).toBeGreaterThan(limits.min_amount);
  });
});

// ============================================================
// 3. LayerswapBridge — fee estimation via real API
// ============================================================

function mockStarknetWallet(chainId: ChainId): WalletInterface {
  return {
    address: fromAddress(
      "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
    ),
    getChainId: () => chainId,
  } as unknown as WalletInterface;
}

function mockEthereumWalletConfig(): EthereumWalletConfig {
  return {
    signer: {
      getAddress: async () => "0x0000000000000000000000000000000000000001",
      sendTransaction: async () => {
        throw new Error("Not implemented in test mock");
      },
    },
    provider: {
      getBalance: async () => 0n,
    },
  } as unknown as EthereumWalletConfig;
}

function layerswapEthToken(): EthereumBridgeToken {
  return new EthereumBridgeToken({
    id: "eth-layerswap",
    name: "Ethereum (Layerswap)",
    symbol: "ETH",
    decimals: 18,
    protocol: Protocol.LAYERSWAP,
    address: "0x0000000000000000000000000000000000000000" as EthereumAddress,
    starknetAddress: fromAddress(
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
    ),
    supportsAutoWithdraw: false,
  });
}

describe("LayerswapBridge (live)", () => {
  it.skipIf(skipLive)(
    "should estimate deposit fees via real Layerswap API",
    async () => {
      const bridge = new LayerswapBridge(
        layerswapEthToken(),
        mockEthereumWalletConfig(),
        mockStarknetWallet(ChainId.SEPOLIA),
        API_KEY,
        NOOP_LOGGER
      );

      const estimation = await bridge.getDepositFeeEstimate();

      console.log("Fee estimation:", {
        l1Fee: estimation.l1Fee.toFormatted(),
        serviceFee: estimation.serviceFee.toFormatted(),
        avgCompletionTime: estimation.avgCompletionTime,
      });

      expect(estimation.serviceFee).toBeDefined();
      expect(estimation.avgCompletionTime).toBeDefined();
    }
  );

  it.skipIf(skipLive)(
    "should return null for allowance (Layerswap handles approvals)",
    async () => {
      const bridge = new LayerswapBridge(
        layerswapEthToken(),
        mockEthereumWalletConfig(),
        mockStarknetWallet(ChainId.SEPOLIA),
        API_KEY,
        NOOP_LOGGER
      );

      const allowance = await bridge.getAllowance();
      expect(allowance).toBeNull();
    }
  );
});

// ============================================================
// 4. Full swap creation (no execution — just API swap creation)
// ============================================================

describe("Layerswap swap creation (live)", () => {
  it.skipIf(skipLive)("should create a swap on Layerswap API", async () => {
    const api = new LayerswapApi({ apiKey: API_KEY });

    const response = await api.createSwap({
      sourceNetwork: "ETHEREUM_SEPOLIA",
      sourceToken: "ETH",
      destinationNetwork: "STARKNET_SEPOLIA",
      destinationToken: "ETH",
      amount: 0.01,
      destinationAddress:
        "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691",
      sourceAddress: "0x0000000000000000000000000000000000000001",
    });

    const swap = response.swap;

    console.log("Created swap:", {
      id: swap.id,
      status: swap.status,
      sourceNetwork: swap.source_network.name,
      destinationNetwork: swap.destination_network.name,
      requestedAmount: swap.requested_amount,
    });

    expect(swap.id).toBeDefined();
    // Swap transitions to "user_transfer_pending" immediately when use_deposit_address is false
    expect(["created", "user_transfer_pending"]).toContain(swap.status);

    // Deposit actions from create response
    console.log(
      "Deposit actions (from create):",
      response.deposit_actions.map((a) => ({
        type: a.type,
        network: a.network.name,
        toAddress: a.to_address,
        amount: a.amount,
        amountInBaseUnits: a.amount_in_base_units,
        hasCallData: !!a.call_data,
        callDataLength: a.call_data?.length ?? 0,
        gasLimit: a.gas_limit,
        order: a.order,
      }))
    );

    expect(response.deposit_actions.length).toBeGreaterThan(0);

    // Fetch swap status
    const swapStatus = await api.getSwap(swap.id);
    console.log("Swap status:", swapStatus.swap.status);
    expect(swapStatus.swap.id).toBe(swap.id);
  });
});
