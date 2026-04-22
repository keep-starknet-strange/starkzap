import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@fatsolutions/tongo-sdk");
});

describe("package entrypoints", () => {
  it("does not load Tongo when importing the root entrypoint", async () => {
    vi.doMock("@fatsolutions/tongo-sdk", () => {
      throw new Error("Tongo should not be loaded from the root entrypoint");
    });

    const rootModule = await import("@/index");

    expect(rootModule.StarkZap).toBeDefined();
    expect("TongoConfidential" in rootModule).toBe(false);
  });

  it("keeps the confidential barrel free of Tongo runtime imports", async () => {
    vi.doMock("@fatsolutions/tongo-sdk", () => {
      throw new Error(
        "Tongo should not be loaded from the confidential barrel"
      );
    });

    const confidentialModule = await import("@/confidential");

    expect("TongoConfidential" in confidentialModule).toBe(false);
  });

  it("exposes Tongo from the explicit subpath", async () => {
    class MockTongoAccount {}

    vi.doMock("@fatsolutions/tongo-sdk", () => ({
      Account: MockTongoAccount,
    }));

    const tongoModule = await import("@/confidential/tongo");

    expect(tongoModule.TongoConfidential).toBeDefined();
  });
});
