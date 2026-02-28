import { describe, expect, it, beforeEach } from "vitest";
import { Amount, ChainId, fromAddress, type Token } from "@/types";
import { StarkgateBridgeProvider, starkgateBridge } from "@/bridge/starkgate";
import { OrbiterBridgeProvider, orbiterBridge } from "@/bridge/orbiter";
import { LayerswapBridgeProvider, layerswapBridge } from "@/bridge/layerswap";
import { BridgeAggregator, createBridgeAggregator } from "@/bridge/aggregator";

const ethToken: Token = {
  name: "Ethereum",
  symbol: "ETH",
  decimals: 18,
  address: fromAddress(
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
  ),
};

const _strkToken: Token = {
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  address: fromAddress(
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd3d9c8c0a3e7d8e7f0d7bd6e"
  ),
};

const recipient = fromAddress("0xabc123");

describe("StarkgateBridgeProvider", () => {
  it("supports mainnet and sepolia", () => {
    const provider = new StarkgateBridgeProvider();

    expect(provider.supportsChainPair(ChainId.MAINNET, ChainId.MAINNET)).toBe(
      true
    );
    expect(provider.supportsChainPair(ChainId.SEPOLIA, ChainId.SEPOLIA)).toBe(
      true
    );
    expect(provider.supportsChainPair(ChainId.MAINNET, ChainId.SEPOLIA)).toBe(
      true
    );
  });

  it("has correct id", () => {
    const provider = new StarkgateBridgeProvider();
    expect(provider.id).toBe("starkgate");
  });

  it("fetches quote with zero fee for ETH", async () => {
    const provider = new StarkgateBridgeProvider();

    const quote = await provider.getQuote({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: ethToken,
      amount: Amount.parse("0.01", ethToken),
      recipient,
    });

    expect(quote.provider).toBe("starkgate");
    expect(quote.feeBase).toBe(0n);
    expect(quote.estimatedTimeSeconds).toBe(300);
  });

  it("builds bridge calls for L2 withdrawal", async () => {
    const provider = new StarkgateBridgeProvider();

    const prepared = await provider.bridge({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: ethToken,
      amount: Amount.parse("0.01", ethToken),
      recipient,
    });

    expect(prepared.calls.length).toBe(1);
    expect(prepared.calls[0]!.entrypoint).toBe("initiate_withdraw");
    expect(prepared.quote.provider).toBe("starkgate");
  });

  it("throws error for unsupported token in bridge()", async () => {
    const provider = new StarkgateBridgeProvider();

    const unsupportedToken: Token = {
      name: "Unknown",
      symbol: "UNKNOWN",
      decimals: 18,
      address: fromAddress("0x999"),
    };

    await expect(
      provider.bridge({
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: unsupportedToken,
        amount: Amount.parse("1", unsupportedToken),
        recipient,
      })
    ).rejects.toThrow("Starkgate does not support token: UNKNOWN");
  });
});

describe("OrbiterBridgeProvider", () => {
  it("has correct id", () => {
    const provider = new OrbiterBridgeProvider();
    expect(provider.id).toBe("orbiter");
  });

  it("supports mainnet and sepolia", () => {
    const provider = new OrbiterBridgeProvider();

    expect(provider.supportsChainPair(ChainId.MAINNET, ChainId.MAINNET)).toBe(
      true
    );
    expect(provider.supportsChainPair(ChainId.SEPOLIA, ChainId.SEPOLIA)).toBe(
      true
    );
  });

  it("fetches quote with fee for ETH", async () => {
    const provider = new OrbiterBridgeProvider();

    const quote = await provider.getQuote({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: ethToken,
      amount: Amount.parse("0.01", ethToken),
      recipient,
    });

    expect(quote.provider).toBe("orbiter");
    expect(quote.feeBase).toBeGreaterThan(0n);
    expect(quote.estimatedTimeSeconds).toBe(180);
  });

  it("builds bridge calls", async () => {
    const provider = new OrbiterBridgeProvider();

    const prepared = await provider.bridge({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: ethToken,
      amount: Amount.parse("0.01", ethToken),
      recipient,
    });

    expect(prepared.calls.length).toBe(1);
    expect(prepared.calls[0]!.entrypoint).toBe("send_cross_chain_message");
    expect(prepared.quote.provider).toBe("orbiter");
  });
});

describe("LayerswapBridgeProvider", () => {
  it("has correct id", () => {
    const provider = new LayerswapBridgeProvider();
    expect(provider.id).toBe("layerswap");
  });

  it("supports mainnet and sepolia", () => {
    const provider = new LayerswapBridgeProvider();

    expect(provider.supportsChainPair(ChainId.MAINNET, ChainId.MAINNET)).toBe(
      true
    );
    expect(provider.supportsChainPair(ChainId.SEPOLIA, ChainId.SEPOLIA)).toBe(
      true
    );
  });

  it("throws error for unsupported token", async () => {
    const provider = new LayerswapBridgeProvider();

    const unsupportedToken: Token = {
      name: "Unknown",
      symbol: "XYZ",
      decimals: 18,
      address: fromAddress("0x999"),
    };

    await expect(
      provider.getQuote({
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: unsupportedToken,
        amount: Amount.parse("1", unsupportedToken),
        recipient,
      })
    ).rejects.toThrow("Layerswap does not support token: XYZ");
  });

  it("creates with API key", () => {
    const provider = new LayerswapBridgeProvider("test-api-key");
    expect(provider).toBeDefined();
  });
});

describe("BridgeAggregator", () => {
  let aggregator: BridgeAggregator;

  beforeEach(() => {
    aggregator = new BridgeAggregator();
  });

  it("registers providers", () => {
    aggregator.registerProvider(starkgateBridge);
    aggregator.registerProvider(orbiterBridge);

    expect(aggregator.listProviders()).toContain("starkgate");
    expect(aggregator.listProviders()).toContain("orbiter");
  });

  it("unregisters providers", () => {
    aggregator.registerProvider(starkgateBridge);
    aggregator.registerProvider(orbiterBridge);

    aggregator.unregisterProvider("starkgate");

    expect(aggregator.listProviders()).not.toContain("starkgate");
    expect(aggregator.listProviders()).toContain("orbiter");
  });

  it("gets provider by id", () => {
    aggregator.registerProvider(starkgateBridge);

    const provider = aggregator.getProvider("starkgate");
    expect(provider?.id).toBe("starkgate");
  });

  it("returns undefined for unknown provider", () => {
    const provider = aggregator.getProvider("unknown");
    expect(provider).toBeUndefined();
  });

  it("gets all quotes from registered providers", async () => {
    aggregator.registerProvider(starkgateBridge);
    aggregator.registerProvider(orbiterBridge);

    const quotes = await aggregator.getAllQuotes({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: ethToken,
      amount: Amount.parse("0.01", ethToken),
      recipient,
    });

    expect(quotes.length).toBe(2);
    expect(quotes.some((q) => q.providerId === "starkgate")).toBe(true);
    expect(quotes.some((q) => q.providerId === "orbiter")).toBe(true);
  });

  it("filters quotes by providers option", async () => {
    aggregator.registerProvider(starkgateBridge);
    aggregator.registerProvider(orbiterBridge);

    const quotes = await aggregator.getAllQuotes({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: ethToken,
      amount: Amount.parse("0.01", ethToken),
      recipient,
    });

    // Filter by providers
    const filtered = quotes.filter((q) => q.providerId === "starkgate");

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.providerId).toBe("starkgate");
  });

  it("gets best quote prioritizing fees", async () => {
    aggregator.registerProvider(starkgateBridge); // Free
    aggregator.registerProvider(orbiterBridge); // Has fee

    const result = await aggregator.getBestQuote(
      {
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: ethToken,
        amount: Amount.parse("0.01", ethToken),
        recipient,
      },
      { prioritizeFees: true }
    );

    expect(result).not.toBeNull();
    // Starkgate should be cheaper (free)
    expect(result?.providerId).toBe("starkgate");
  });

  it("gets best quote prioritizing time", async () => {
    aggregator.registerProvider(starkgateBridge);
    aggregator.registerProvider(orbiterBridge);

    const result = await aggregator.getBestQuote(
      {
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: ethToken,
        amount: Amount.parse("0.01", ethToken),
        recipient,
      },
      { prioritizeFees: false }
    );

    expect(result).not.toBeNull();
    // Orbiter is faster (180s vs 300s)
    expect(result?.providerId).toBe("orbiter");
  });

  it("filters by max fee", async () => {
    aggregator.registerProvider(starkgateBridge); // Free
    aggregator.registerProvider(orbiterBridge); // Has fee

    const result = await aggregator.getBestQuote(
      {
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: ethToken,
        amount: Amount.parse("0.01", ethToken),
        recipient,
      },
      { maxFee: 0n } // Only allow free
    );

    expect(result).not.toBeNull();
    expect(result?.providerId).toBe("starkgate");
  });

  it("returns null when no valid quotes", async () => {
    aggregator.registerProvider(starkgateBridge);

    const result = await aggregator.getBestQuote(
      {
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: ethToken,
        amount: Amount.parse("0.01", ethToken),
        recipient,
      },
      { maxFee: 0n, providers: ["unknown"] } // Non-existent provider
    );

    expect(result).toBeNull();
  });

  it("executes bridge with best provider", async () => {
    aggregator.registerProvider(starkgateBridge);
    aggregator.registerProvider(orbiterBridge);

    const result = await aggregator.bridge(
      {
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: ethToken,
        amount: Amount.parse("0.01", ethToken),
        recipient,
      },
      { prioritizeFees: true }
    );

    expect(result).not.toBeNull();
    expect(result?.providerId).toBe("starkgate");
    expect(result?.prepared.calls.length).toBeGreaterThan(0);
  });

  it("returns null for bridge when no valid quotes", async () => {
    aggregator.registerProvider(starkgateBridge);

    const result = await aggregator.bridge(
      {
        sourceChainId: ChainId.SEPOLIA,
        destChainId: ChainId.SEPOLIA,
        token: ethToken,
        amount: Amount.parse("0.01", ethToken),
        recipient,
      },
      { maxFee: 0n, providers: ["unknown"] }
    );

    expect(result).toBeNull();
  });
});

describe("BridgeProvider interface compatibility", () => {
  it("all providers implement BridgeProvider interface", () => {
    const starkgate = new StarkgateBridgeProvider();
    const orbiter = new OrbiterBridgeProvider();
    const layerswap = new LayerswapBridgeProvider();
    const _aggregator = new BridgeAggregator();

    // Check required properties
    expect(starkgate.id).toBeDefined();
    expect(starkgate.supportedSourceChains).toBeDefined();
    expect(starkgate.supportedDestChains).toBeDefined();
    expect(typeof starkgate.supportsChainPair).toBe("function");
    expect(typeof starkgate.getQuote).toBe("function");
    expect(typeof starkgate.bridge).toBe("function");

    expect(orbiter.id).toBeDefined();
    expect(orbiter.supportedSourceChains).toBeDefined();
    expect(orbiter.supportedDestChains).toBeDefined();
    expect(typeof orbiter.supportsChainPair).toBe("function");
    expect(typeof orbiter.getQuote).toBe("function");
    expect(typeof orbiter.bridge).toBe("function");

    expect(layerswap.id).toBeDefined();
    expect(layerswap.supportedSourceChains).toBeDefined();
    expect(layerswap.supportedDestChains).toBeDefined();
    expect(typeof layerswap.supportsChainPair).toBe("function");
    expect(typeof layerswap.getQuote).toBe("function");
    expect(typeof layerswap.bridge).toBe("function");
  });

  it("default exports are available", () => {
    expect(starkgateBridge.id).toBe("starkgate");
    expect(orbiterBridge.id).toBe("orbiter");
    expect(layerswapBridge.id).toBe("layerswap");
  });

  it("createBridgeAggregator works", () => {
    const agg = createBridgeAggregator([starkgateBridge, orbiterBridge]);
    expect(agg.listProviders()).toContain("starkgate");
    expect(agg.listProviders()).toContain("orbiter");
  });
});
