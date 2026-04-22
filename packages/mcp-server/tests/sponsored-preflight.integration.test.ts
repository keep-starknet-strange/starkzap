import type { Wallet } from "starkzap";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type TestingExports = {
  handleCallToolRequest(request: {
    params: { name: string; arguments?: Record<string, unknown> | undefined };
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  setWalletSingleton(value: Wallet | undefined): void;
  resetState(): void;
};

let testing: TestingExports;
const originalArgv = [...process.argv];
const originalEnv = { ...process.env };
const originalTestingHooks = (globalThis as Record<string, unknown>)
  .__STARKZAP_MCP_TESTING__;

const WALLET_ADDRESS =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const EXPECTED_CLASS_HASH =
  "0x01d1777db36cdd06dd62cfde77b1b6ae06412af95d57a13dc40ac77b8a702381";
const MISMATCHED_CLASS_HASH =
  "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f";

function undeployedProvider() {
  return {
    getClassHashAt: vi.fn().mockRejectedValue(new Error("Contract not found")),
  };
}

function mismatchedProvider() {
  return {
    getClassHashAt: vi.fn().mockResolvedValue(MISMATCHED_CLASS_HASH),
  };
}

function deployedProvider() {
  return {
    getClassHashAt: vi.fn().mockResolvedValue(EXPECTED_CLASS_HASH),
  };
}

function tx(hash: string) {
  return {
    hash,
    wait: vi.fn().mockResolvedValue(undefined),
    explorerUrl: `https://example.com/tx/${hash}`,
  };
}

beforeAll(async () => {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).__STARKZAP_MCP_TESTING__;
  delete process.env.STARKNET_ACCOUNT_ADDRESS;
  delete process.env.STARKNET_STAKING_CONTRACT;
  delete process.env.STARKNET_PAYMASTER_URL;
  delete process.env.AVNU_PAYMASTER_API_KEY;
  process.env.NODE_ENV = "test";
  process.env.STARKZAP_MCP_ENABLE_TEST_HOOKS = "1";
  process.env.STARKZAP_MCP_TEST_KEY_MARKER =
    "TEST_KEY_DO_NOT_USE_IN_PRODUCTION";
  process.env.STARKNET_PRIVATE_KEY = "0x1";
  process.argv = [
    "node",
    "sponsored-preflight.integration.test.ts",
    "--network",
    "sepolia",
    "--enable-write",
    "--enable-execute",
  ];

  await import("../src/index.js");
  const hooks = (globalThis as Record<string, unknown>)
    .__STARKZAP_MCP_TESTING__;
  if (!hooks) {
    throw new Error("Expected __STARKZAP_MCP_TESTING__ hooks to be available");
  }
  testing = hooks as TestingExports;
});

beforeEach(() => {
  testing.resetState();
});

afterAll(() => {
  process.argv = originalArgv;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
  (globalThis as Record<string, unknown>).__STARKZAP_MCP_TESTING__ =
    originalTestingHooks;
});

describe("sponsored write preflight hardening", () => {
  it("allows sponsored transfer preflight to continue when the account is undeployed", async () => {
    const transfer = vi.fn().mockResolvedValue(tx("0x123"));
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: undeployedProvider,
      transfer,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: {
          token: "STRK",
          transfers: [{ to: "0x1", amount: "0.1" }],
          sponsored: true,
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain(
      "Sponsored transfer post-check succeeded but wallet account is still not deployed on-chain."
    );
    expect(result.content[0]?.text ?? "").toContain("Transaction hash:");
    expect(transfer).toHaveBeenCalledOnce();
    expect(transfer).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        feeMode: "sponsored",
      })
    );
  });

  it("blocks sponsored transfer before submission when account class hash mismatches", async () => {
    const transfer = vi.fn();
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: mismatchedProvider,
      transfer,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_transfer",
        arguments: {
          token: "STRK",
          transfers: [{ to: "0x1", amount: "0.1" }],
          sponsored: true,
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain(
      "Sponsored transfer preflight detected account class hash mismatch"
    );
    expect(transfer).not.toHaveBeenCalled();
  });

  it("allows sponsored execute preflight to continue when the account is undeployed", async () => {
    const execute = vi.fn().mockResolvedValue(tx("0x456"));
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: undeployedProvider,
      execute,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_execute",
        arguments: {
          calls: [{ contractAddress: "0x1", entrypoint: "transfer" }],
          sponsored: true,
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain(
      "Sponsored execute post-check succeeded but wallet account is still not deployed on-chain."
    );
    expect(result.content[0]?.text ?? "").toContain("Transaction hash:");
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        feeMode: "sponsored",
      })
    );
  });

  it("blocks sponsored execute before submission when account class hash mismatches", async () => {
    const execute = vi.fn();
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: mismatchedProvider,
      execute,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_execute",
        arguments: {
          calls: [{ contractAddress: "0x1", entrypoint: "transfer" }],
          sponsored: true,
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain(
      "Sponsored execute preflight detected account class hash mismatch"
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows sponsored swap preflight to continue when the account is undeployed", async () => {
    const swap = vi.fn().mockResolvedValue(tx("0x789"));
    const getQuote = vi.fn().mockResolvedValue({
      amountInBase: 100000000000000000n,
      amountOutBase: 100000n,
      provider: "avnu",
    });
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: undeployedProvider,
      getQuote,
      swap,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_swap",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "0.1",
          sponsored: true,
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain(
      "Sponsored swap post-check succeeded but wallet account is still not deployed on-chain."
    );
    expect(result.content[0]?.text ?? "").toContain("Transaction hash:");
    expect(getQuote).toHaveBeenCalledOnce();
    expect(swap).toHaveBeenCalledOnce();
    expect(swap).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        feeMode: "sponsored",
      })
    );
  });

  it("executes non-sponsored swap and reports the pretrade quote source", async () => {
    const swap = vi.fn().mockResolvedValue(tx("0xabc"));
    const getQuote = vi.fn().mockResolvedValue({
      amountInBase: 100000000000000000n,
      amountOutBase: 100000n,
      provider: "avnu",
    });
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: deployedProvider,
      getQuote,
      swap,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_swap",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "0.1",
        },
      },
    });

    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      hash?: string;
      amountOutRaw?: string;
      amountOutSource?: string;
    };
    expect(payload.hash).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000abc"
    );
    expect(payload.amountOutRaw).toBe("100000");
    expect(payload.amountOutSource).toBe("pretrade_quote");
    expect(getQuote).toHaveBeenCalledOnce();
    expect(swap).toHaveBeenCalledOnce();
    expect(swap).toHaveBeenCalledWith(expect.anything(), {});
  });

  it("blocks sponsored swap before submission when account class hash mismatches", async () => {
    const swap = vi.fn();
    const getQuote = vi.fn().mockResolvedValue({
      amountInBase: 100000000000000000n,
      amountOutBase: 100000n,
      provider: "avnu",
    });
    const wallet = {
      address: WALLET_ADDRESS,
      getClassHash: () => EXPECTED_CLASS_HASH,
      getProvider: mismatchedProvider,
      getQuote,
      swap,
    } as unknown as Wallet;

    testing.setWalletSingleton(wallet);

    const result = await testing.handleCallToolRequest({
      params: {
        name: "starkzap_swap",
        arguments: {
          tokenIn: "STRK",
          tokenOut: "USDC",
          amountIn: "0.1",
          sponsored: true,
        },
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain(
      "Sponsored swap preflight detected account class hash mismatch"
    );
    expect(getQuote).toHaveBeenCalledOnce();
    expect(swap).not.toHaveBeenCalled();
  });
});
