import { describe, expect, it } from "vitest";
import {
  MAINNET_PAYMASTER_DISABLED_MESSAGE,
  resolveExamplePaymasterNodeUrl,
} from "../examples/shared/paymaster";

describe("mobile example paymaster config", () => {
  it("derives the local proxy automatically on sepolia", () => {
    expect(
      resolveExamplePaymasterNodeUrl({
        privyServerUrl: "http://127.0.0.1:3001/",
        chainId: "SN_SEPOLIA",
      })
    ).toBe("http://127.0.0.1:3001/api/paymaster");
  });

  it("does not auto-derive the local proxy on mainnet", () => {
    expect(
      resolveExamplePaymasterNodeUrl({
        privyServerUrl: "http://127.0.0.1:3001",
        chainId: "SN_MAIN",
      })
    ).toBeNull();
    expect(MAINNET_PAYMASTER_DISABLED_MESSAGE).toContain("Mainnet");
  });

  it("preserves an explicit paymaster URL on mainnet", () => {
    expect(
      resolveExamplePaymasterNodeUrl({
        explicitProxyUrl: "https://paymaster.example.com",
        privyServerUrl: "http://127.0.0.1:3001",
        chainId: "SN_MAIN",
      })
    ).toBe("https://paymaster.example.com");
  });
});
