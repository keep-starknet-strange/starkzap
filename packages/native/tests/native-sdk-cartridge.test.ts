import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChainId, OnboardStrategy } from "starkzap";
import { StarkZap } from "@/sdk";
import {
  clearCartridgeNativeAdapter,
  registerCartridgeNativeAdapter,
} from "@/cartridge/registry";
import type { CartridgeNativeAdapter } from "@/cartridge/types";

function makeAdapter() {
  const connect = vi.fn().mockResolvedValue({
    account: {
      address: "0x123",
      executePaymasterTransaction: vi
        .fn()
        .mockResolvedValue({ transaction_hash: "0xabc" }),
    },
    username: vi.fn().mockResolvedValue("player"),
    disconnect: vi.fn().mockResolvedValue(undefined),
    controller: { sdk: "controller.c" },
  });

  const adapter: CartridgeNativeAdapter = {
    connect,
  };

  return { adapter, connect };
}

function makeSdk(): StarkZap {
  const sdk = new StarkZap({ network: "sepolia" });
  // Avoid network I/O from inherited chain validation helper.
  (sdk as unknown as { ensureProviderChainMatchesConfig: () => Promise<void> })
    .ensureProviderChainMatchesConfig = async () => {};
  vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
    ChainId.SEPOLIA.toFelt252()
  );
  return sdk;
}

describe("@starkzap/native cartridge sdk", () => {
  beforeEach(() => {
    clearCartridgeNativeAdapter();
  });

  it("throws a deterministic error when adapter is missing", async () => {
    const sdk = makeSdk();
    await expect(sdk.connectCartridge()).rejects.toThrow(
      "Cartridge native adapter is not registered."
    );
  });

  it("forwards options to the adapter including forceNewSession", async () => {
    const sdk = makeSdk();
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockResolvedValue("0x1");

    const { adapter, connect } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    const wallet = await sdk.connectCartridge({
      policies: [{ target: "0xaaa", method: "transfer" }],
      url: "https://x.cartridge.gg",
      redirectUrl: "mobile://cartridge/callback",
      forceNewSession: true,
    });

    expect(wallet.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000123"
    );

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: ChainId.SEPOLIA.toFelt252(),
        policies: [{ target: "0xaaa", method: "transfer" }],
        url: "https://x.cartridge.gg",
        redirectUrl: "mobile://cartridge/callback",
        forceNewSession: true,
      })
    );
    const callArg = connect.mock.calls[0]?.[0];
    expect(callArg?.rpcUrl).toContain("sepolia");
  });

  it("defaults cartridge onboard deploy mode to never", async () => {
    const sdk = makeSdk();
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockRejectedValue(
      new Error("contract not found")
    );

    const { adapter } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      cartridge: {
        policies: [{ target: "0xaaa", method: "transfer" }],
      },
    });

    expect(onboard.strategy).toBe(OnboardStrategy.Cartridge);
    expect(onboard.wallet.address).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000123"
    );
  });

  it("runs ensureReady when deploy is explicitly requested", async () => {
    const sdk = makeSdk();
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockRejectedValue(
      new Error("contract not found")
    );

    const { adapter } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    await expect(
      sdk.onboard({
        strategy: OnboardStrategy.Cartridge,
        deploy: "if_needed",
        cartridge: {
          policies: [{ target: "0xaaa", method: "transfer" }],
        },
      })
    ).rejects.toThrow("does not support deployment in this release");
  });
});

