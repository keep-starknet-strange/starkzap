import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the @cartridge/controller module
vi.mock("@cartridge/controller", () => {
  const mockWalletAccount = {
    address: "0x1234567890abcdef",
    signer: {
      signTransaction: vi.fn().mockResolvedValue(["0xsig1", "0xsig2"]),
      signMessage: vi.fn().mockResolvedValue(["0xmsg1", "0xmsg2"]),
    },
    signMessage: vi.fn().mockResolvedValue(["0xmsg1", "0xmsg2"]),
    execute: vi.fn().mockResolvedValue({ transaction_hash: "0xtxhash" }),
    executePaymasterTransaction: vi
      .fn()
      .mockResolvedValue({ transaction_hash: "0xsponsored" }),
    buildPaymasterTransaction: vi.fn().mockResolvedValue({
      type: "invoke",
      typed_data: {},
      fee: { gas_price: "0x1" },
    }),
    preparePaymasterTransaction: vi.fn().mockResolvedValue({
      type: "invoke",
      invoke: { signature: ["0xsig"] },
    }),
    simulateTransaction: vi.fn().mockResolvedValue([
      {
        transaction_trace: {
          execute_invocation: {},
        },
      },
    ]),
  };

  class MockController {
    probe = vi.fn().mockResolvedValue(null);
    connect = vi.fn().mockResolvedValue(mockWalletAccount);
    disconnect = vi.fn().mockResolvedValue(undefined);
    openProfile = vi.fn();
    openSettings = vi.fn();
    username = vi.fn().mockResolvedValue("testuser");
    rpcUrl = vi.fn().mockReturnValue("https://api.cartridge.gg/x/test");
    isReady = vi.fn().mockReturnValue(true);
    keychain = {
      deploy: vi.fn().mockResolvedValue({
        code: "SUCCESS",
        transaction_hash: "0xdeploy",
      }),
    };
  }

  return { default: MockController };
});

// Mock starknet RpcProvider
vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();

  class MockRpcProvider {
    channel = { nodeUrl: "https://test.rpc" };
    getClassHashAt = vi.fn().mockResolvedValue("0xclasshash");
  }

  return {
    ...actual,
    RpcProvider: MockRpcProvider,
  };
});

import { CartridgeWallet } from "../src/index.js";

describe("CartridgeWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should create and connect a CartridgeWallet", async () => {
      const wallet = await CartridgeWallet.create({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      });

      expect(wallet).toBeInstanceOf(CartridgeWallet);
      expect(wallet.address).toBe("0x1234567890abcdef");
    });

    it("should accept policies option", async () => {
      const wallet = await CartridgeWallet.create({
        policies: [{ target: "0xCONTRACT", method: "transfer" }],
      });

      expect(wallet.address).toBeDefined();
    });

    it("should work with no options", async () => {
      const wallet = await CartridgeWallet.create();

      expect(wallet.address).toBeDefined();
    });

    it("should accept feeMode and timeBounds options", async () => {
      const wallet = await CartridgeWallet.create({
        feeMode: "sponsored",
        timeBounds: { executeBefore: 12345 },
      });

      expect(wallet.address).toBeDefined();
    });
  });

  describe("isDeployed", () => {
    it("should return true when deployed", async () => {
      const wallet = await CartridgeWallet.create();
      const deployed = await wallet.isDeployed();

      expect(deployed).toBe(true);
    });
  });

  describe("execute", () => {
    it("should execute calls and return Tx", async () => {
      const wallet = await CartridgeWallet.create();
      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: ["0x456", "100"],
        },
      ];

      const tx = await wallet.execute(calls);

      expect(tx.hash).toBe("0xtxhash");
    });

    it("should use paymaster for sponsored mode", async () => {
      const wallet = await CartridgeWallet.create({
        feeMode: "sponsored",
      });
      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: ["0x456", "100"],
        },
      ];

      const tx = await wallet.execute(calls);

      expect(tx.hash).toBe("0xsponsored");
    });
  });

  describe("buildSponsored", () => {
    it("should build a sponsored transaction", async () => {
      const wallet = await CartridgeWallet.create();
      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: [],
        },
      ];

      const prepared = await wallet.buildSponsored(calls);

      expect(prepared).toBeDefined();
      expect(prepared.type).toBe("invoke");
    });
  });

  describe("signSponsored", () => {
    it("should sign a prepared transaction", async () => {
      const wallet = await CartridgeWallet.create();
      const prepared = {
        type: "invoke" as const,
        typed_data: {},
        fee: { gas_price: "0x1" },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const executable = await wallet.signSponsored(prepared as any);

      expect(executable).toBeDefined();
    });
  });

  describe("prepareSponsored", () => {
    it("should build and sign in one step", async () => {
      const wallet = await CartridgeWallet.create();
      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: [],
        },
      ];

      const executable = await wallet.prepareSponsored(calls);

      expect(executable).toBeDefined();
    });
  });

  describe("preflight", () => {
    it("should return ok for deployed account", async () => {
      const wallet = await CartridgeWallet.create();

      const result = await wallet.preflight({ kind: "transfer" });

      expect(result.ok).toBe(true);
    });
  });

  describe("getAccount", () => {
    it("should return the wallet account", async () => {
      const wallet = await CartridgeWallet.create();
      const account = wallet.getAccount();

      expect(account.address).toBe("0x1234567890abcdef");
    });
  });

  describe("getController", () => {
    it("should return the Cartridge Controller", async () => {
      const wallet = await CartridgeWallet.create();
      const controller = wallet.getController();

      expect(controller).toBeDefined();
      expect(typeof controller.openProfile).toBe("function");
    });
  });

  describe("username", () => {
    it("should return the username", async () => {
      const wallet = await CartridgeWallet.create();
      const username = await wallet.username();

      expect(username).toBe("testuser");
    });
  });

  describe("disconnect", () => {
    it("should disconnect from controller", async () => {
      const wallet = await CartridgeWallet.create();
      const controller = wallet.getController();

      await wallet.disconnect();

      expect(controller.disconnect).toHaveBeenCalled();
    });
  });
});
