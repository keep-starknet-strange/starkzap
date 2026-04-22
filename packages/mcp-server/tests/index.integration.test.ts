import { Amount, fromAddress, mainnetTokens } from "starkzap";
import type { Token, Wallet } from "starkzap";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TOKEN: Token = {
  name: "STRK",
  symbol: "STRK",
  address:
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab0720189f9f3f75e66" as Token["address"],
  decimals: 18,
};

const KNOWN_MAINNET_TOKEN: Token = (() => {
  const preferred = Object.values(mainnetTokens).find(
    (token) => token.symbol.toUpperCase() === "STRK"
  );
  return preferred ?? TEST_TOKEN;
})();

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
  isSecureRpcUrl(rawUrl: string): boolean;
  isRpcLikeError(error: unknown): boolean;
  evaluateTestHooksExposureConfig(config: {
    testHooksEnabled: boolean;
    testHookMarkerAcknowledged: boolean;
    allowUnsafeTestHooks: boolean;
    unsafeTestHooksAcknowledged: boolean;
    hasProductionLikeIndicators: boolean;
    deprecatedMainnetBypassEnabled: boolean;
  }): { exposeHooks: boolean; reason: string };
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
  process.env.STARKZAP_MCP_TEST_KEY_MARKER =
    "TEST_KEY_DO_NOT_USE_IN_PRODUCTION";
  process.env.STARKNET_PRIVATE_KEY = "0x1";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x2";
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
        address: fromAddress("0x2"),
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
    expect(connectWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        accountAddress: fromAddress("0x2"),
      })
    );

    testing.setNowProvider(() => 2_000);
    await expect(testing.getWallet()).resolves.toBeDefined();
    expect(connectWallet).toHaveBeenCalledTimes(2);
    expect(connectWallet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountAddress: fromAddress("0x2"),
      })
    );
  });

  it("fails wallet init when SDK ignores the configured account override", async () => {
    const connectWallet = vi.fn().mockResolvedValue({
      address: fromAddress("0x3"),
      disconnect: vi.fn().mockResolvedValue(undefined),
    });

    testing.setSdkSingleton({ connectWallet });
    testing.setNowProvider(() => 10_000);

    await expect(testing.getWallet()).rejects.toThrow(
      /Requested account override/
    );
    expect(connectWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        accountAddress: fromAddress("0x2"),
      })
    );
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

  it("scrubs sensitive env vars from process.env after startup parse", () => {
    expect(process.env.STARKNET_PRIVATE_KEY).toBeUndefined();
    expect(process.env.AVNU_PAYMASTER_API_KEY).toBeUndefined();
  });

  it("enforces test-hook exposure safety gates", () => {
    expect(
      testing.evaluateTestHooksExposureConfig({
        testHooksEnabled: true,
        testHookMarkerAcknowledged: false,
        allowUnsafeTestHooks: false,
        unsafeTestHooksAcknowledged: false,
        hasProductionLikeIndicators: false,
        deprecatedMainnetBypassEnabled: false,
      })
    ).toEqual({ exposeHooks: false, reason: "missing-test-key-marker" });

    expect(() =>
      testing.evaluateTestHooksExposureConfig({
        testHooksEnabled: true,
        testHookMarkerAcknowledged: true,
        allowUnsafeTestHooks: true,
        unsafeTestHooksAcknowledged: true,
        hasProductionLikeIndicators: true,
        deprecatedMainnetBypassEnabled: false,
      })
    ).toThrow(/forbidden in production-like environments/);

    expect(() =>
      testing.evaluateTestHooksExposureConfig({
        testHooksEnabled: true,
        testHookMarkerAcknowledged: true,
        allowUnsafeTestHooks: false,
        unsafeTestHooksAcknowledged: false,
        hasProductionLikeIndicators: false,
        deprecatedMainnetBypassEnabled: true,
      })
    ).toThrow(/no longer supported/);
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

    const allowlistedWithUrl = testing.buildToolErrorText(
      new Error(
        "Could not resolve staking pool metadata for 0x1. upstream said https://user:pass@internal.rpc.local:8545"
      )
    );
    expect(allowlistedWithUrl).toContain("Operation failed. Reference:");
    expect(allowlistedWithUrl).not.toContain("internal.rpc.local");
    expect(allowlistedWithUrl).not.toContain("user:pass");

    const overlyLongAllowlisted = testing.buildToolErrorText(
      new Error(`Could not resolve staking pool metadata ${"x".repeat(600)}`)
    );
    expect(overlyLongAllowlisted).toContain("Operation failed. Reference:");
  });

  it("accepts http loopback URLs including bracketed IPv6 localhost", () => {
    expect(testing.isSecureRpcUrl("http://localhost:5050")).toBe(true);
    expect(testing.isSecureRpcUrl("http://127.0.0.1:5050")).toBe(true);
    expect(testing.isSecureRpcUrl("http://[::1]:5050")).toBe(true);
    expect(testing.isSecureRpcUrl("http://[2001:db8::1]:5050")).toBe(false);
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

  it("returns batched balances for multiple tokens", async () => {
    testing.setWalletSingleton({
      balanceOf: vi.fn(async (token: Token) =>
        token.symbol === "STRK"
          ? Amount.parse("1.25", token)
          : Amount.parse("2.5", token)
      ),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_balances",
        arguments: { tokens: ["STRK", "USDC"] },
      },
    });
    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content[0]?.text ?? "{}") as {
      balances?: Array<{ token?: string; balance?: string; raw?: string }>;
    };
    expect(payload.balances).toHaveLength(2);
    expect(payload.balances?.[0]?.token).toBe("STRK");
    expect(payload.balances?.[0]?.balance).toBe("1.25");
    expect(payload.balances?.[1]?.token).toBe("USDC");
    expect(payload.balances?.[1]?.balance).toBe("2.5");
    expect(
      payload.balances?.every((entry) => typeof entry.raw === "string")
    ).toBe(true);
  });

  it("rejects semantically duplicate tokens in batched balances", async () => {
    const balanceOf = vi.fn();
    testing.setWalletSingleton({
      balanceOf,
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_balances",
        arguments: {
          tokens: [KNOWN_MAINNET_TOKEN.symbol, KNOWN_MAINNET_TOKEN.address],
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Duplicate token requested after resolution"
    );
    expect(balanceOf).not.toHaveBeenCalled();
  });

  it("rejects malformed swap quote responses from SDK", async () => {
    testing.setWalletSingleton({
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: 1n,
        amountOutBase: "not-bigint",
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_quote",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap quote returned by SDK"
    );
  });

  it("rejects unsafe provider ids in swap quote responses", async () => {
    testing.setWalletSingleton({
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: 1n,
        amountOutBase: 2n,
        provider: "bad provider\nid",
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_quote",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap quote returned by SDK: provider must be a safe provider id."
    );
  });

  it("rejects non-positive swap quote amounts from SDK", async () => {
    testing.setWalletSingleton({
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: 1n,
        amountOutBase: 0n,
        provider: "avnu",
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_quote",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "amountOutBase must be a positive bigint"
    );
  });

  it("rejects swap quote when tokenIn/tokenOut resolve to the same token", async () => {
    const getQuote = vi.fn();
    testing.setWalletSingleton({
      getQuote,
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_quote",
        arguments: {
          tokenIn: KNOWN_MAINNET_TOKEN.symbol,
          tokenOut: KNOWN_MAINNET_TOKEN.address,
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Swap quote: tokenIn and tokenOut resolve to the same token"
    );
    expect(getQuote).not.toHaveBeenCalled();
  });

  it("builds unsigned swap calls without execution", async () => {
    const calls = [
      {
        contractAddress: "0x1",
        entrypoint: "swap_exact_tokens",
        calldata: [1n, "0x2", 3],
      },
    ];
    const callsFn = vi.fn().mockResolvedValue(calls);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
          slippageBps: 50,
          provider: "avnu",
        },
      },
    });
    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content[0]?.text ?? "{}") as {
      calls?: Array<{
        contractAddress: string;
        entrypoint: string;
        calldata: string[];
      }>;
    };
    expect(swapFn).toHaveBeenCalledTimes(1);
    expect(payload.calls).toHaveLength(1);
    expect(payload.calls?.[0]?.contractAddress).toBe(fromAddress("0x1"));
    expect(payload.calls?.[0]?.entrypoint).toBe("swap_exact_tokens");
    expect(payload.calls?.[0]?.calldata).toEqual(["0x1", "0x2", "3"]);
  });

  it("rejects build_swap_calls when calldata contains unsafe numeric values", async () => {
    const callsFn = vi.fn().mockResolvedValue([
      {
        contractAddress: "0x1",
        entrypoint: "swap_exact_tokens",
        calldata: [Number.MAX_SAFE_INTEGER + 1],
      },
    ]);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);

    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap_call_0 returned by SDK: calldata_0 must be a non-negative safe integer."
    );
  });

  it("rejects build_swap_calls when calldata contains invalid strings", async () => {
    const callsFn = vi.fn().mockResolvedValue([
      {
        contractAddress: "0x1",
        entrypoint: "swap_exact_tokens",
        calldata: ["0xnothex"],
      },
    ]);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);

    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap_call_0 returned by SDK: calldata_0 must be a felt-like hex or decimal string."
    );
  });

  it("rejects build_swap_calls when decimal calldata exceeds felt range", async () => {
    const tooLargeDecimal = "9".repeat(90);
    const callsFn = vi.fn().mockResolvedValue([
      {
        contractAddress: "0x1",
        entrypoint: "swap_exact_tokens",
        calldata: [tooLargeDecimal],
      },
    ]);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);

    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap_call_0 returned by SDK: calldata_0 exceeds felt range."
    );
  });

  it("rejects build_swap_calls when hex calldata exceeds felt252 upper bound", async () => {
    const tooLargeHex =
      "0x0800000000000011000000000000000000000000000000000000000000000001";
    const callsFn = vi.fn().mockResolvedValue([
      {
        contractAddress: "0x1",
        entrypoint: "swap_exact_tokens",
        calldata: [tooLargeHex],
      },
    ]);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);

    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap_call_0 returned by SDK: calldata_0 exceeds felt range."
    );
  });

  it("rejects build_swap_calls when tokenIn/tokenOut resolve to the same token", async () => {
    const callsFn = vi.fn();
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: KNOWN_MAINNET_TOKEN.symbol,
          tokenOut: KNOWN_MAINNET_TOKEN.address,
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Build swap calls: tokenIn and tokenOut resolve to the same token"
    );
    expect(swapFn).not.toHaveBeenCalled();
    expect(callsFn).not.toHaveBeenCalled();
  });

  it("rejects build_swap_calls when SDK returns non-array calls", async () => {
    const callsFn = vi.fn().mockResolvedValue("not-an-array");
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap calls returned by SDK: expected 1-10 calls."
    );
  });

  it("rejects build_swap_calls when SDK returns invalid entrypoint names", async () => {
    const callsFn = vi.fn().mockResolvedValue([
      {
        contractAddress: "0x1",
        entrypoint: "transfer!",
        calldata: [],
      },
    ]);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap_call_0 returned by SDK: entrypoint must be a valid Cairo identifier."
    );
  });

  it("rejects build_swap_calls when aggregated calldata item count is too large", async () => {
    const largeCalldata = Array.from({ length: 1500 }, () => "1");
    const callsFn = vi.fn().mockResolvedValue([
      {
        contractAddress: "0x1",
        entrypoint: "swap_exact_tokens",
        calldata: largeCalldata,
      },
      {
        contractAddress: "0x2",
        entrypoint: "swap_exact_tokens",
        calldata: largeCalldata,
      },
      {
        contractAddress: "0x3",
        entrypoint: "swap_exact_tokens",
        calldata: largeCalldata,
      },
    ]);
    const swapFn = vi.fn().mockReturnValue({ calls: callsFn });
    testing.setWalletSingleton({
      tx: vi.fn().mockReturnValue({
        swap: swapFn,
      }),
    } as unknown as Wallet);

    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_build_swap_calls",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Invalid swap calls returned by SDK: calldata item count exceeds 4096."
    );
  });

  it("keeps swap execution write-gated by default", async () => {
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_swap",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "1",
        },
      },
    });
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("disabled by default");
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

  it("rejects malformed fee unit responses from SDK", async () => {
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

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Operation failed. Reference:");
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

  it("rejects unreasonable unpoolTime values in pool position responses", async () => {
    testing.setWalletSingleton({
      getPoolPosition: vi.fn().mockResolvedValue({
        staked: Amount.parse("1", TEST_TOKEN),
        rewards: Amount.parse("0", TEST_TOKEN),
        total: Amount.parse("1", TEST_TOKEN),
        unpooling: Amount.parse("0", TEST_TOKEN),
        commissionPercent: 5,
        unpoolTime: new Date("2999-01-01T00:00:00.000Z"),
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_pool_position",
        arguments: { pool: "0x1" },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("unpoolTime");
  });

  it("rejects pool position responses with inconsistent total", async () => {
    testing.setWalletSingleton({
      getPoolPosition: vi.fn().mockResolvedValue({
        staked: Amount.parse("1", TEST_TOKEN),
        rewards: Amount.parse("0.1", TEST_TOKEN),
        total: Amount.parse("1.2", TEST_TOKEN),
        unpooling: Amount.parse("0", TEST_TOKEN),
        commissionPercent: 5,
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
    expect(response.content[0]?.text).toContain("total does not match");
  });

  it("keeps pool position responses deterministic by omitting wall-clock fields", async () => {
    const unpoolTime = new Date("2026-02-27T12:00:00.000Z");
    testing.setWalletSingleton({
      getPoolPosition: vi.fn().mockResolvedValue({
        staked: Amount.parse("1", TEST_TOKEN),
        rewards: Amount.parse("0.1", TEST_TOKEN),
        total: Amount.parse("1.1", TEST_TOKEN),
        unpooling: Amount.parse("0.2", TEST_TOKEN),
        commissionPercent: 5,
        unpoolTime,
      }),
    } as unknown as Wallet);
    const response = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_get_pool_position",
        arguments: { pool: "0x1" },
      },
    });

    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content[0]?.text ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload.unpoolTimeEpochMs).toBe(unpoolTime.getTime());
    expect(payload).not.toHaveProperty("secondsUntilUnpool");
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
      getPoolPosition: vi.fn(async () => {
        const currentReward = rewards[Math.min(idx++, rewards.length - 1)];
        const staked = Amount.parse("1", TEST_TOKEN);
        return {
          staked,
          rewards: currentReward,
          total: staked.add(currentReward),
          unpooling: Amount.parse("0", TEST_TOKEN),
          commissionPercent: 0,
          unpoolTime: null,
        };
      }),
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
