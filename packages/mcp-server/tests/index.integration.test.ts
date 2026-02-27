import { Amount, fromAddress } from "starkzap";
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
  waitForTrackedTransaction(
    tx: { wait: () => Promise<void>; hash: string; explorerUrl?: string },
    timeoutMs?: number
  ): Promise<{ hash: string; explorerUrl?: string }>;
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
  assertStableExitAmountWithinCap(
    wallet: Wallet,
    poolAddress: string,
    poolToken: Token,
    maxCap: string
  ): Promise<void>;
  buildToolErrorText(error: unknown): string;
  isRpcLikeError(error: unknown): boolean;
  handleCallToolRequest(request: {
    params: { name: string; arguments?: Record<string, unknown> | undefined };
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  trackedTransactions(): { active: string[]; timedOut: string[] };
  setNowProvider(provider: () => number): void;
  setSdkSingleton(value: unknown): void;
  setWalletSingleton(value: Wallet | undefined): void;
  getSdkConfig(): Record<string, unknown>;
  resetState(): void;
};

let testing: TestingExports;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.STARKZAP_MCP_ENABLE_TEST_HOOKS = "1";
  process.env.STARKNET_PRIVATE_KEY = `0x${"1".padStart(64, "0")}`;
  process.env.STARKNET_STAKING_CONTRACT =
    "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1";
  process.env.STARKNET_PAYMASTER_URL = "https://sepolia.paymaster.avnu.fi";
  process.env.AVNU_PAYMASTER_API_KEY = "test-avnu-key";
  process.argv = [
    "node",
    "index.integration.test.ts",
    "--write-rate-limit-rpm",
    "1",
  ];
  await import("../src/index.js");
  const hooks = (globalThis as Record<string, unknown>)
    .__STARKZAP_MCP_TESTING__;
  if (!hooks) {
    throw new Error(
      "Expected __STARKZAP_MCP_TESTING__ hooks to be available in tests"
    );
  }
  testing = hooks as TestingExports;
});

beforeEach(() => {
  testing.resetState();
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("index integration hardening", () => {
  const validTransferArgs = {
    token: "STRK",
    transfers: [
      {
        to: "0x1",
        amount: "0.1",
      },
    ],
  };

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

  it("wires paymaster URL and API key into SDK config", () => {
    const sdkConfig = testing.getSdkConfig() as {
      paymaster?: { nodeUrl?: string; headers?: Record<string, string> };
    };
    expect(sdkConfig.paymaster?.nodeUrl).toBe(
      "https://sepolia.paymaster.avnu.fi"
    );
    expect(sdkConfig.paymaster?.headers?.["x-paymaster-api-key"]).toBe(
      "test-avnu-key"
    );
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

  it("returns actionable timeout messages with tx references", () => {
    const text = testing.buildToolErrorText(
      new Error("Transaction 0x123 was submitted but not confirmed")
    );
    expect(text).toContain("Transaction 0x123 was submitted");
    expect(text).not.toContain("Operation failed. Reference:");
    expect(text).toMatch(/Error: Transaction 0x123/);
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

    const hostOnly = testing.buildToolErrorText(
      new Error("dial tcp rpc.internal.local:8545: connection refused")
    );
    expect(hostOnly).toContain("Operation failed. Reference:");
    expect(hostOnly).not.toContain("rpc.internal.local:8545");

    const ipv6Host = testing.buildToolErrorText(
      new Error("dial tcp [2001:db8::1]:8545: i/o timeout")
    );
    expect(ipv6Host).toContain("Operation failed. Reference:");
    expect(ipv6Host).not.toContain("2001:db8::1");
  });

  it("classifies structured RPC transport errors and excludes tx wait timeouts", () => {
    expect(testing.isRpcLikeError({ code: "ETIMEDOUT" })).toBe(true);
    expect(testing.isRpcLikeError({ status: 504 })).toBe(true);
    expect(
      testing.isRpcLikeError(
        new Error("Transaction 0xabc confirmation timed out after 120000ms")
      )
    ).toBe(false);
  });

  it("handles MCP request path end-to-end for validation and sanitization", async () => {
    const validationResponse = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_balance",
        arguments: {},
      },
    });
    expect(validationResponse.isError).toBe(true);
    expect(validationResponse.content[0]?.text).toContain("Validation error:");

    testing.setWalletSingleton({
      balanceOf: vi
        .fn()
        .mockRejectedValue(
          new Error("internal upstream failure on http://private-rpc.local")
        ),
    } as unknown as Wallet);
    const sanitizedResponse = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_balance",
        arguments: { token: "STRK" },
      },
    });
    expect(sanitizedResponse.isError).toBe(true);
    expect(sanitizedResponse.content[0]?.text).toContain(
      "Operation failed. Reference:"
    );
    expect(sanitizedResponse.content[0]?.text).not.toContain(
      "private-rpc.local"
    );
  });

  it("does not charge write rate limit for unknown tools", async () => {
    const unknown = await testing.handleCallToolRequest({
      params: { name: "starkzap_not_a_tool", arguments: {} },
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0]?.text).toContain("Unknown tool");

    const writeCall = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: validTransferArgs,
      },
    });
    expect(writeCall.isError).toBe(true);
    expect(writeCall.content[0]?.text).toContain("disabled by default");
    expect(writeCall.content[0]?.text).not.toContain("Rate limit exceeded");
  });

  it("applies write rate limiting for repeated known write calls", async () => {
    const first = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: validTransferArgs,
      },
    });
    expect(first.isError).toBe(true);
    expect(first.content[0]?.text).toContain("disabled by default");

    const second = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: validTransferArgs,
      },
    });
    expect(second.isError).toBe(true);
    expect(second.content[0]?.text).toContain("Rate limit exceeded");
  });

  it("counts known write validation failures toward write rate limits", async () => {
    const invalid = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: {
          transfers: [{ to: "0x1", amount: "0.1" }],
        },
      },
    });
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Validation error:");

    const followUp = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: validTransferArgs,
      },
    });
    expect(followUp.isError).toBe(true);
    expect(followUp.content[0]?.text).toContain("Rate limit exceeded");
  });

  it("fails with clear message when SDK balance shape is malformed", async () => {
    testing.setWalletSingleton({
      balanceOf: vi.fn().mockResolvedValue({ value: "not-an-amount" }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_balance",
        arguments: { token: "STRK" },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid balance returned by SDK"
    );
  });

  it("fails with clear message when fee estimate overall_fee is malformed", async () => {
    testing.setWalletSingleton({
      estimateFee: vi.fn().mockResolvedValue({
        overall_fee: "123",
        unit: "wei",
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 2n },
          l2_gas: { max_amount: 3n, max_price_per_unit: 4n },
          l1_data_gas: { max_amount: 5n, max_price_per_unit: 6n },
        },
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_estimate_fee",
        arguments: {
          calls: [
            {
              contractAddress: TEST_TOKEN.address,
              entrypoint: "transfer",
              calldata: [],
            },
          ],
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Operation failed. Reference:");
  });

  it("normalizes missing fee unit to unknown", async () => {
    testing.setWalletSingleton({
      estimateFee: vi.fn().mockResolvedValue({
        overall_fee: 123n,
        resourceBounds: {
          l1_gas: { max_amount: 1n, max_price_per_unit: 2n },
          l2_gas: { max_amount: 3n, max_price_per_unit: 4n },
          l1_data_gas: { max_amount: 5n, max_price_per_unit: 6n },
        },
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_estimate_fee",
        arguments: {
          calls: [
            {
              contractAddress: TEST_TOKEN.address,
              entrypoint: "transfer",
              calldata: [],
            },
          ],
        },
      },
    });

    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content[0]?.text ?? "{}") as {
      unit?: string;
    };
    expect(payload.unit).toBe("unknown");
  });

  it("rejects malformed commission percent in pool position responses", async () => {
    testing.setWalletSingleton({
      getPoolPosition: vi.fn().mockResolvedValue({
        staked: Amount.parse("1", TEST_TOKEN),
        rewards: Amount.parse("0", TEST_TOKEN),
        total: Amount.parse("1", TEST_TOKEN),
        unpooling: Amount.parse("0", TEST_TOKEN),
        commissionPercent: "invalid",
        unpoolTime: null,
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_pool_position",
        arguments: { pool: "0x1" },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("commissionPercent");
  });

  it("allows read-only tasks to run concurrently", async () => {
    const events: string[] = [];
    const readA = testing.runWithToolConcurrencyPolicy(
      "starkzap_get_balance",
      async () => {
        events.push("A:start");
        await delay(20);
        events.push("A:end");
      }
    );
    const readB = testing.runWithToolConcurrencyPolicy(
      "starkzap_estimate_fee",
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
      "starkzap_transfer",
      async () => {
        events.push("A:start");
        await delay(20);
        events.push("A:end");
      }
    );
    await delay(1);
    const writeB = testing.runWithToolConcurrencyPolicy(
      "starkzap_transfer",
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
        staked: Amount.parse("1", TEST_TOKEN),
        rewards: rewards[Math.min(idx++, rewards.length - 1)],
        total: Amount.parse("1", TEST_TOKEN),
        unpooling: Amount.parse("0", TEST_TOKEN),
        commissionPercent: 0,
        unpoolTime: null,
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

  it("enforces exit cap against unpooling + rewards", async () => {
    const rewards = [
      Amount.parse("0.6", TEST_TOKEN),
      Amount.parse("0.6", TEST_TOKEN),
      Amount.parse("0.6", TEST_TOKEN),
    ];
    const unpooling = [
      Amount.parse("0.6", TEST_TOKEN),
      Amount.parse("0.6", TEST_TOKEN),
      Amount.parse("0.6", TEST_TOKEN),
    ];
    let idx = 0;
    const mockWallet = {
      getPoolPosition: vi.fn(async () => {
        const current = Math.min(idx++, rewards.length - 1);
        return {
          staked: Amount.parse("10", TEST_TOKEN),
          rewards: rewards[current],
          total: Amount.parse("10.6", TEST_TOKEN),
          unpooling: unpooling[current],
          commissionPercent: 0,
          unpoolTime: null,
        };
      }),
    };

    await expect(
      testing.assertStableExitAmountWithinCap(
        mockWallet as unknown as Wallet,
        TEST_TOKEN.address,
        TEST_TOKEN,
        "1"
      )
    ).rejects.toThrow(/per-operation cap/);
  });

  it("rejects zero transaction hashes from SDK", async () => {
    await expect(
      testing.waitForTrackedTransaction({
        hash: "0x0",
        wait: async () => undefined,
      })
    ).rejects.toThrow(/Invalid transaction hash returned by SDK/);
  });

  it("tracks timed-out tx hashes separately from active tx hashes", async () => {
    await expect(
      testing.waitForTrackedTransaction(
        {
          hash: "0x123",
          wait: async () => new Promise(() => {}),
        },
        5
      )
    ).rejects.toThrow(/submitted but not confirmed/);

    const tracked = testing.trackedTransactions();
    expect(tracked.active).toEqual([]);
    expect(tracked.timedOut).toEqual([fromAddress("0x123")]);
  });

  it("drops unsafe explorerUrl schemes from SDK tx results", async () => {
    const result = await testing.waitForTrackedTransaction({
      hash: "0xabc",
      explorerUrl: "javascript:alert(1)",
      wait: async () => undefined,
    });
    expect(result.hash).toBe(fromAddress("0xabc"));
    expect(result.explorerUrl).toBeUndefined();
  });

  it("drops explorerUrl values with credentials or excessive length", async () => {
    const withCredentials = await testing.waitForTrackedTransaction({
      hash: "0xabc1",
      explorerUrl: "https://user:pass@sepolia.voyager.online/tx/0xabc1",
      wait: async () => undefined,
    });
    expect(withCredentials.explorerUrl).toBeUndefined();

    const tooLong = await testing.waitForTrackedTransaction({
      hash: "0xabc2",
      explorerUrl: `https://sepolia.voyager.online/tx/${"a".repeat(600)}`,
      wait: async () => undefined,
    });
    expect(tooLong.explorerUrl).toBeUndefined();
  });

  it("keeps tx.wait context when waiting for transaction confirmation", async () => {
    const tx = {
      hash: "0xabc",
      calls: 0,
      async wait() {
        this.calls += 1;
      },
    };

    await testing.waitForTrackedTransaction(tx);
    expect(tx.calls).toBe(1);
  });
});
