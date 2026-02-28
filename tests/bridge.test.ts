import { describe, expect, it } from "vitest";
import { Amount, ChainId, fromAddress, type Token } from "@/types";
import { StarkgateBridgeProvider, starkgateBridge } from "@/bridge/starkgate";
import { OrbiterBridgeProvider, orbiterBridge } from "@/bridge/orbiter";

const ethToken: Token = {
  name: "Ethereum",
  symbol: "ETH",
  decimals: 18,
  address: fromAddress(
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
  ),
};

const strkToken: Token = {
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
    expect(quote.amountBase).toBe(10000000000000000n);
    expect(quote.destAmountBase).toBe(10000000000000000n);
  });

  it("fetches quote with zero fee for STRK", async () => {
    const provider = new StarkgateBridgeProvider();

    const quote = await provider.getQuote({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: strkToken,
      amount: Amount.parse("1", strkToken),
      recipient,
    });

    expect(quote.provider).toBe("starkgate");
    expect(quote.feeBase).toBe(0n);
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
    // Contract address is normalized by fromAddress
    expect(prepared.calls[0]!.contractAddress).toBeDefined();
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

  it("throws error for unsupported chain in bridge()", async () => {
    const provider = new StarkgateBridgeProvider();

    // Use sepolia for both but try unsupported token
    const unsupportedToken: Token = {
      name: "Unknown",
      symbol: "XYZ",
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
    ).rejects.toThrow("Starkgate does not support token: XYZ");
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

  it("fetches quote with fee for STRK", async () => {
    const provider = new OrbiterBridgeProvider();

    const quote = await provider.getQuote({
      sourceChainId: ChainId.SEPOLIA,
      destChainId: ChainId.SEPOLIA,
      token: strkToken,
      amount: Amount.parse("1", strkToken),
      recipient,
    });

    expect(quote.provider).toBe("orbiter");
    expect(quote.feeBase).toBeGreaterThan(0n);
    expect(quote.destAmountBase).toBeLessThan(quote.amountBase);
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

describe("BridgeProvider interface compatibility", () => {
  it("both providers implement BridgeProvider interface", () => {
    const starkgate = new StarkgateBridgeProvider();
    const orbiter = new OrbiterBridgeProvider();

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
  });

  it("starkgateBridge is exported correctly", () => {
    expect(starkgateBridge.id).toBe("starkgate");
  });

  it("orbiterBridge is exported correctly", () => {
    expect(orbiterBridge.id).toBe("orbiter");
  });
});
