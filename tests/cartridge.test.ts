import { describe, it, expect, vi, beforeEach } from "vitest";
import { CartridgeWallet } from "@/wallet/cartridge";
import { ChainId } from "@/types";
import Controller, { toSessionPolicies } from "@cartridge/controller";

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
    static options: unknown[] = [];

    constructor(options?: unknown) {
      MockController.options.push(options);
    }

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

  return {
    default: MockController,
    toSessionPolicies: vi.fn((policies) => policies),
  };
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

describe("CartridgeWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Controller as unknown as { options: unknown[] }).options = [];
  });

  describe("create", () => {
    it("should create and connect a CartridgeWallet", async () => {
      const wallet = await CartridgeWallet.create({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      });

      expect(wallet).toBeInstanceOf(CartridgeWallet);
      expect(wallet.address).toBe(
        "0x0000000000000000000000000000000000000000000000001234567890abcdef"
      );

      const options = (
        Controller as unknown as { options: Array<Record<string, unknown>> }
      ).options[0];
      expect(options.chains).toEqual([
        { rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia" },
      ]);
    });

    it("should forward chainId as defaultChainId", async () => {
      await CartridgeWallet.create({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: ChainId.SEPOLIA,
      });

      const options = (
        Controller as unknown as { options: Array<Record<string, unknown>> }
      ).options[0];
      expect(options.defaultChainId).toBe(ChainId.SEPOLIA.toFelt252());
    });

    it("should accept policies option", async () => {
      const policies = [{ target: "0xCONTRACT", method: "transfer" }];
      const wallet = await CartridgeWallet.create({
        policies,
      });

      expect(wallet.address).toBeDefined();
      expect(toSessionPolicies).toHaveBeenCalledWith(policies);
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

  describe("deploy", () => {
    it("should not cache deployment as successful before on-chain confirmation", async () => {
      const wallet = await CartridgeWallet.create();
      const getClassHashAt = (
        wallet.getProvider() as unknown as {
          getClassHashAt: ReturnType<typeof vi.fn>;
        }
      ).getClassHashAt;

      // Simulate an undeployed account even after deploy() returned a hash.
      getClassHashAt.mockRejectedValue(new Error("contract not found"));

      const tx = await wallet.deploy();
      expect(tx.hash).toBe("0xdeploy");
      await expect(wallet.isDeployed()).resolves.toBe(false);
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

    it("should not pre-deploy before sponsored execution", async () => {
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

      const getClassHashAt = (
        wallet.getProvider() as unknown as {
          getClassHashAt: ReturnType<typeof vi.fn>;
        }
      ).getClassHashAt;
      const initialDeploymentChecks = getClassHashAt.mock.calls.length;

      // If execute() starts checking deployment first again, this will be hit.
      getClassHashAt.mockRejectedValue(new Error("contract not found"));

      const tx = await wallet.execute(calls);

      const controller = wallet.getController() as unknown as {
        keychain: { deploy: ReturnType<typeof vi.fn> };
      };
      const account = wallet.getAccount() as unknown as {
        executePaymasterTransaction: ReturnType<typeof vi.fn>;
      };

      expect(tx.hash).toBe("0xsponsored");
      expect(account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
      expect(controller.keychain.deploy).not.toHaveBeenCalled();
      expect(getClassHashAt.mock.calls.length).toBe(initialDeploymentChecks);
    });

    it("should throw in user_pays mode when account is undeployed", async () => {
      const wallet = await CartridgeWallet.create();
      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: ["0x456", "100"],
        },
      ];

      const getClassHashAt = (
        wallet.getProvider() as unknown as {
          getClassHashAt: ReturnType<typeof vi.fn>;
        }
      ).getClassHashAt;
      getClassHashAt.mockRejectedValue(new Error("contract not found"));

      await expect(
        wallet.execute(calls, { feeMode: "user_pays" })
      ).rejects.toThrow(
        'Account is not deployed. Call wallet.ensureReady({ deploy: "if_needed" }) before execute() in user_pays mode.'
      );

      const controller = wallet.getController() as unknown as {
        keychain: { deploy: ReturnType<typeof vi.fn> };
      };
      const account = wallet.getAccount() as unknown as {
        execute: ReturnType<typeof vi.fn>;
      };

      expect(controller.keychain.deploy).not.toHaveBeenCalled();
      expect(account.execute).not.toHaveBeenCalled();
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
