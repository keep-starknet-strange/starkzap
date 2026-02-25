import { Amount } from "starkzap";
import type { Token, Wallet } from "starkzap";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TOKEN: Token = {
  name: "STRK",
  symbol: "STRK",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab0720189f9f3f75e66" as Token["address"],
  decimals: 18,
};

type TestingExports = {
  withTimeout<T>(
    operation: string,
    promiseFactory: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T>;
  waitWithTimeout(
    tx: { wait: () => Promise<void>; hash: string },
    timeoutMs?: number
  ): Promise<void>;
  getWallet(): Promise<Wallet>;
  runWithToolConcurrencyPolicy<T>(
    toolName: string,
    task: () => Promise<T>
  ): Promise<T>;
  assertStablePoolAmountWithinCap(
    wallet: Wallet,
    poolAddress: string,
    poolToken: Token,
    field: "rewards" | "unpooling",
    maxCap: string,
    operation: "claim rewards" | "exit pool"
  ): Promise<void>;
  buildToolErrorText(error: unknown): string;
  setNowProvider(provider: () => number): void;
  setSdkSingleton(value: unknown): void;
  setWalletSingleton(value: Wallet | undefined): void;
  resetState(): void;
};

let testing: TestingExports;

beforeAll(async () => {
  process.env.STARKNET_PRIVATE_KEY = `0x${"1".padStart(64, "0")}`;
  const imported = await import("../src/index.js");
  testing = imported.__testing as TestingExports;
});

beforeEach(() => {
  testing.resetState();
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("index integration hardening", () => {
  it("handles wallet init failure with retry backoff", async () => {
    const connectWallet = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce({
        disconnect: vi.fn().mockResolvedValue(undefined),
      });

    testing.setSdkSingleton({ connectWallet });
    testing.setNowProvider(() => 1_000);

    await expect(testing.getWallet()).rejects.toThrow(
      /Wallet initialization failed/
    );
    await expect(testing.getWallet()).rejects.toThrow(
      /temporarily throttled after recent failures/
    );
    expect(connectWallet).toHaveBeenCalledTimes(1);

    testing.setNowProvider(() => 2_000);
    await expect(testing.getWallet()).resolves.toBeDefined();
    expect(connectWallet).toHaveBeenCalledTimes(2);
  });

  it("times out hanging RPC promises", async () => {
    await expect(
      testing.withTimeout("Balance query", async () => new Promise(() => {}), 5)
    ).rejects.toThrow(/timed out/);
  });

  it("times out hanging transaction wait", async () => {
    await expect(
      testing.waitWithTimeout(
        { hash: "0x1", wait: async () => new Promise(() => {}) },
        5
      )
    ).rejects.toThrow(/confirmation timed out/);
  });

  it("sanitizes unsafe errors and keeps allowlisted messages", () => {
    const safe = testing.buildToolErrorText(
      new Error("Could not resolve staking pool metadata")
    );
    expect(safe).toContain("Could not resolve staking pool metadata");

    const unsafe = testing.buildToolErrorText(
      new Error("Internal failure on http://internal.rpc.local")
    );
    expect(unsafe).toContain("Operation failed. Reference:");
    expect(unsafe).not.toContain("internal.rpc.local");
  });

  it("allows read-only tasks to run concurrently", async () => {
    const events: string[] = [];
    const readA = testing.runWithToolConcurrencyPolicy(
      "x_get_balance",
      async () => {
        events.push("A:start");
        await delay(20);
        events.push("A:end");
      }
    );
    const readB = testing.runWithToolConcurrencyPolicy(
      "x_estimate_fee",
      async () => {
        events.push("B:start");
        await delay(5);
        events.push("B:end");
      }
    );

    await Promise.all([readA, readB]);
    expect(events.slice(0, 2)).toEqual(["A:start", "B:start"]);
  });

  it("serializes state-changing tasks", async () => {
    const events: string[] = [];
    const writeA = testing.runWithToolConcurrencyPolicy(
      "x_transfer",
      async () => {
        events.push("A:start");
        await delay(20);
        events.push("A:end");
      }
    );
    await delay(1);
    const writeB = testing.runWithToolConcurrencyPolicy(
      "x_transfer",
      async () => {
        events.push("B:start");
        await delay(5);
        events.push("B:end");
      }
    );

    await Promise.all([writeA, writeB]);
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  it("detects TOCTOU drift in pool amount double-check flow", async () => {
    const rewards = [
      Amount.parse("1", TEST_TOKEN),
      Amount.parse("1", TEST_TOKEN),
      Amount.parse("2", TEST_TOKEN),
    ];
    let idx = 0;
    const mockWallet = {
      getPoolPosition: vi.fn(async () => ({
        rewards: rewards[Math.min(idx++, rewards.length - 1)],
        unpooling: Amount.parse("0", TEST_TOKEN),
      })),
    };

    await expect(
      testing.assertStablePoolAmountWithinCap(
        mockWallet as unknown as Wallet,
        TEST_TOKEN.address,
        TEST_TOKEN,
        "rewards",
        "10",
        "claim rewards"
      )
    ).rejects.toThrow(/changed right before submission/);
  });
});
