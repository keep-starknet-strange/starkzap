import { describe, expect, it } from "vitest";

import { getNetworkSelectionPatch } from "../examples/mobile/network-selection";

describe("mobile network selection helpers", () => {
  it("applies the selected network immediately before the SDK is configured", () => {
    const patch = getNetworkSelectionPatch({
      index: 1,
      isConfigured: false,
      network: {
        chainId: "SN_MAIN",
        rpcUrl: "https://mainnet.example/rpc",
      },
    });

    expect(patch).toEqual({
      selectedNetworkIndex: 1,
      chainId: "SN_MAIN",
      rpcUrl: "https://mainnet.example/rpc",
    });
  });

  it("keeps active rpc and chain unchanged until reconfirm when already configured", () => {
    const patch = getNetworkSelectionPatch({
      index: 0,
      isConfigured: true,
      network: {
        chainId: "SN_SEPOLIA",
        rpcUrl: "https://sepolia.example/rpc",
      },
    });

    expect(patch).toEqual({
      selectedNetworkIndex: 0,
    });
  });

  it("ignores unknown network indexes", () => {
    const patch = getNetworkSelectionPatch({
      index: 99,
      isConfigured: false,
    });

    expect(patch).toBeNull();
  });
});
