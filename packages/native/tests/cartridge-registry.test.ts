import { describe, it, expect, beforeEach } from "vitest";
import {
  clearCartridgeNativeAdapter,
  getCartridgeNativeAdapter,
  getCartridgeNativeAdapterOrThrow,
  registerCartridgeNativeAdapter,
} from "@/cartridge/registry";
import type { CartridgeNativeAdapter } from "@/cartridge/types";

function makeAdapter(): CartridgeNativeAdapter {
  return {
    connect: async () => {
      return {
        account: {
          address: "0x1",
          execute: async () => ({
            transaction_hash: "0xtx",
          }),
        },
      };
    },
  };
}

describe("cartridge native adapter registry", () => {
  beforeEach(() => {
    clearCartridgeNativeAdapter();
  });

  it("registers and retrieves adapter", () => {
    const adapter = makeAdapter();
    registerCartridgeNativeAdapter(adapter);
    expect(getCartridgeNativeAdapter()).toBe(adapter);
  });

  it("replaces adapter when registering a new one", () => {
    registerCartridgeNativeAdapter(makeAdapter());
    const replacement = makeAdapter();
    registerCartridgeNativeAdapter(replacement);
    expect(getCartridgeNativeAdapter()).toBe(replacement);
  });

  it("clears adapter", () => {
    registerCartridgeNativeAdapter(makeAdapter());
    clearCartridgeNativeAdapter();
    expect(getCartridgeNativeAdapter()).toBeNull();
  });

  it("throws deterministic error when adapter is missing", () => {
    expect(() => getCartridgeNativeAdapterOrThrow()).toThrow(
      "Cartridge adapter is not registered."
    );
  });
});
