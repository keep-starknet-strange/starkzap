import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChainId,
  OnboardStrategy,
  type BridgingConfig,
  type DcaProvider,
  type SwapProvider,
} from "starkzap";
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
      execute: vi.fn().mockResolvedValue({ transaction_hash: "0xabc" }),
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
  // Stub the inherited chain validation lookup to keep tests offline.
  vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
    ChainId.SEPOLIA.toFelt252()
  );
  return sdk;
}

function makeSwapProvider(id: string): SwapProvider {
  return {
    id,
    supportsChain: vi.fn().mockReturnValue(true),
    getQuote: vi.fn(),
    prepareSwap: vi.fn(),
  };
}

function makeDcaProvider(id: string): DcaProvider {
  return {
    id,
    supportsChain: vi.fn().mockReturnValue(true),
    getOrders: vi.fn(),
    prepareCreate: vi.fn(),
    prepareCancel: vi.fn(),
  };
}

describe("starkzap-native cartridge sdk", () => {
  beforeEach(() => {
    clearCartridgeNativeAdapter();
  });

  it("throws a deterministic error when adapter is missing", async () => {
    const sdk = makeSdk();
    const getChainId = vi
      .spyOn(sdk.getProvider(), "getChainId")
      .mockRejectedValue(new Error("rpc offline"));

    await expect(sdk.connectCartridge()).rejects.toThrow(
      "Cartridge adapter is not registered."
    );
    expect(getChainId).not.toHaveBeenCalled();
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

  it("scopes the resolved adapter to each sdk instance", async () => {
    const { adapter: firstAdapter, connect: firstConnect } = makeAdapter();
    registerCartridgeNativeAdapter(firstAdapter);

    const firstSdk = makeSdk();
    vi.spyOn(firstSdk.getProvider(), "getClassHashAt").mockResolvedValue("0x1");

    const { adapter: secondAdapter, connect: secondConnect } = makeAdapter();
    registerCartridgeNativeAdapter(secondAdapter);

    const secondSdk = makeSdk();
    vi.spyOn(secondSdk.getProvider(), "getClassHashAt").mockResolvedValue(
      "0x1"
    );

    await firstSdk.connectCartridge({
      policies: [{ target: "0xaaa", method: "transfer" }],
    });
    await secondSdk.connectCartridge({
      policies: [{ target: "0xbbb", method: "transfer" }],
    });

    expect(firstConnect).toHaveBeenCalledTimes(1);
    expect(secondConnect).toHaveBeenCalledTimes(1);
  });

  it("uses the core-resolved rpcUrl instead of provider internals", async () => {
    const rpcUrl = "https://rpc.example/path";
    const sdk = new StarkZap({
      network: "sepolia",
      rpcUrl,
    });
    vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
      ChainId.SEPOLIA.toFelt252()
    );
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockResolvedValue("0x1");

    (
      sdk.getProvider() as unknown as {
        channel: { nodeUrl: string };
      }
    ).channel.nodeUrl = "https://wrong.example";

    const { adapter, connect } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    await sdk.connectCartridge({
      policies: [{ target: "0xaaa", method: "transfer" }],
    });

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcUrl: new URL(rpcUrl).toString(),
      })
    );
  });

  it.each([
    ["empty array", []],
    ["empty contracts object", { contracts: {} }],
  ])(
    "treats %s policies as absent when using a preset",
    async (_label, policies) => {
      const sdk = makeSdk();
      vi.spyOn(sdk.getProvider(), "getClassHashAt").mockResolvedValue("0x1");

      const { adapter, connect } = makeAdapter();
      registerCartridgeNativeAdapter(adapter);

      await sdk.connectCartridge({
        policies,
        preset: "session-preset",
      });

      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: ChainId.SEPOLIA.toFelt252(),
          preset: "session-preset",
        })
      );

      expect(connect.mock.calls[0]?.[0]).not.toHaveProperty("policies");
    }
  );

  it("rejects unsupported default fee modes before connecting", async () => {
    const sdk = makeSdk();
    const getChainId = vi
      .spyOn(sdk.getProvider(), "getChainId")
      .mockRejectedValue(new Error("rpc offline"));
    const { adapter, connect } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    await expect(
      sdk.connectCartridge({
        policies: [{ target: "0xaaa", method: "transfer" }],
        feeMode: "user_pays",
      })
    ).rejects.toThrow("supports sponsored session execution only");

    expect(getChainId).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects missing policies or preset before provider validation", async () => {
    const sdk = makeSdk();
    const getChainId = vi
      .spyOn(sdk.getProvider(), "getChainId")
      .mockRejectedValue(new Error("rpc offline"));
    const { adapter, connect } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    await expect(sdk.connectCartridge()).rejects.toThrow(
      "Cartridge session connection requires either non-empty policies or a preset that resolves policies for the active chain."
    );

    expect(getChainId).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
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

  it("rejects runtime deploy requests that bypass the native cartridge type", async () => {
    const sdk = makeSdk();
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockRejectedValue(
      new Error("contract not found")
    );

    const { adapter } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    const unsupportedDeployRequest = {
      strategy: OnboardStrategy.Cartridge,
      deploy: "if_needed",
      cartridge: {
        policies: [{ target: "0xaaa", method: "transfer" }],
      },
    } as never;

    await expect(sdk.onboard(unsupportedDeployRequest)).rejects.toThrow(
      "does not support deployment in this release"
    );
  });

  it("reapplies swap and dca providers during native cartridge onboarding", async () => {
    const sdk = makeSdk();
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockResolvedValue("0x1");

    const { adapter } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    const swapProvider = makeSwapProvider("custom-swap");
    const dcaProvider = makeDcaProvider("custom-dca");

    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      cartridge: {
        policies: [{ target: "0xaaa", method: "transfer" }],
      },
      swapProviders: [swapProvider],
      defaultSwapProviderId: swapProvider.id,
      dcaProviders: [dcaProvider],
      defaultDcaProviderId: dcaProvider.id,
    });

    expect(onboard.wallet.listSwapProviders()).toContain(swapProvider.id);
    expect(onboard.wallet.getDefaultSwapProvider().id).toBe(swapProvider.id);
    expect(onboard.wallet.dca().listProviders()).toContain(dcaProvider.id);
    expect(onboard.wallet.dca().getDefaultDcaProvider().id).toBe(
      dcaProvider.id
    );
  });

  it("retains bridging config when creating a native cartridge wallet", async () => {
    const bridging: BridgingConfig = {
      layerZeroApiKey: "lz-key",
      ethereumRpcUrl: "https://eth.example",
      solanaRpcUrl: "https://sol.example",
    };
    const sdk = new StarkZap({
      network: "sepolia",
      bridging,
    });
    vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
      ChainId.SEPOLIA.toFelt252()
    );
    vi.spyOn(sdk.getProvider(), "getClassHashAt").mockResolvedValue("0x1");

    const { adapter } = makeAdapter();
    registerCartridgeNativeAdapter(adapter);

    const wallet = await sdk.connectCartridge({
      policies: [{ target: "0xaaa", method: "transfer" }],
    });

    expect(
      (
        wallet as unknown as {
          bridging: { bridgingConfig?: BridgingConfig };
        }
      ).bridging.bridgingConfig
    ).toEqual(bridging);
  });
});
