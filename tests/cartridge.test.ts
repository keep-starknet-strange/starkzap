import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CartridgeWallet, _resetControllerCache } from "@/wallet/cartridge";
import { StarkZap } from "@/sdk";
import { ChainId } from "@/types";

const { MockController, mockToSessionPolicies } = vi.hoisted(() => {
  class ControllerMock {
    static options: unknown[] = [];

    constructor(options?: unknown) {
      ControllerMock.options.push(options);
    }

    async probe(): Promise<unknown> {
      return null;
    }
    async connect(): Promise<unknown> {
      return undefined;
    }
    disconnect = vi.fn().mockResolvedValue(undefined);
    openProfile = vi.fn();
    openSettings = vi.fn();
    username = vi.fn().mockResolvedValue("testuser");
    rpcUrl = vi.fn().mockReturnValue("https://api.cartridge.gg/x/test");
    isReady(): boolean {
      return true;
    }
    keychain = {
      deploy: vi.fn().mockResolvedValue({
        code: "SUCCESS",
        transaction_hash: "0xdeploy",
      }),
    };
  }

  return {
    MockController: ControllerMock,
    mockToSessionPolicies: vi.fn((policies: unknown) => policies),
  };
});

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
    estimateInvokeFee: vi.fn().mockResolvedValue({}),
  };
  MockController.prototype.connect = vi
    .fn()
    .mockResolvedValue(mockWalletAccount);
  MockController.prototype.probe = vi.fn().mockResolvedValue(null);
  MockController.prototype.isReady = vi.fn().mockReturnValue(true);

  return {
    default: MockController,
    toSessionPolicies: mockToSessionPolicies,
  };
});

// Mock starknet RpcProvider
vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();

  class MockRpcProvider {
    channel = { nodeUrl: "https://test.rpc" };
    getChainId = vi.fn().mockResolvedValue(ChainId.SEPOLIA.toFelt252());
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
    _resetControllerCache();
    MockController.options = [];
    MockController.prototype.probe = vi.fn().mockResolvedValue(null);
    MockController.prototype.isReady = vi.fn().mockReturnValue(true);
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
        MockController as { options: Array<Record<string, unknown>> }
      ).options[0];
      if (!options) {
        throw new Error("Expected controller options to be recorded");
      }
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
        MockController as { options: Array<Record<string, unknown>> }
      ).options[0];
      if (!options) {
        throw new Error("Expected controller options to be recorded");
      }
      expect(options.defaultChainId).toBe(ChainId.SEPOLIA.toFelt252());
    });

    it("should accept policies option", async () => {
      const policies = [{ target: "0xCONTRACT", method: "transfer" }];
      const wallet = await CartridgeWallet.create({
        policies,
      });

      expect(wallet.address).toBeDefined();
      expect(mockToSessionPolicies).toHaveBeenCalledWith(policies);
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

    it("should reject unsupported deploy options", async () => {
      const wallet = await CartridgeWallet.create();
      await expect(wallet.deploy({ feeMode: "sponsored" })).rejects.toThrow(
        "does not support DeployOptions overrides"
      );
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

      const result = await wallet.preflight({
        calls: [
          {
            contractAddress: "0x123",
            entrypoint: "transfer",
            calldata: [],
          },
        ],
      });

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
      const controller = wallet.getController() as {
        openProfile?: unknown;
      };

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
      const controller = wallet.getController() as {
        disconnect: ReturnType<typeof vi.fn>;
      };

      await wallet.disconnect();

      expect(controller.disconnect).toHaveBeenCalled();
    });
  });

  describe("probe", () => {
    it("should return null when no session exists", async () => {
      const result = await CartridgeWallet.probe();

      expect(result).toBeNull();
    });

    it("should return a CartridgeWallet when a valid session exists", async () => {
      MockController.prototype.probe = MockController.prototype.connect;

      const result = await CartridgeWallet.probe({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      });

      expect(result).toBeInstanceOf(CartridgeWallet);
      expect(result?.address).toBe(
        "0x0000000000000000000000000000000000000000000000001234567890abcdef"
      );
    });

    it("should return null when controller does not support probe", async () => {
      const probeBackup = MockController.prototype.probe;
      // @ts-expect-error simulating older controller without probe
      delete MockController.prototype.probe;

      try {
        const result = await CartridgeWallet.probe();
        expect(result).toBeNull();
      } finally {
        MockController.prototype.probe = probeBackup;
      }
    });

    it("should wait for controller readiness before probing", async () => {
      let readyCallCount = 0;
      MockController.prototype.isReady = vi.fn().mockImplementation(() => {
        readyCallCount += 1;
        return readyCallCount > 2;
      });

      await CartridgeWallet.probe();

      expect(readyCallCount).toBeGreaterThan(1);
      expect(MockController.prototype.probe).toHaveBeenCalled();
    });

    it("should forward options to the controller identically to create()", async () => {
      const policies = [{ target: "0xCONTRACT", method: "transfer" }];

      await CartridgeWallet.probe({
        rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
        chainId: ChainId.SEPOLIA,
        policies,
        preset: "my-preset",
      });

      const options = (
        MockController as { options: Array<Record<string, unknown>> }
      ).options[0];
      if (!options) {
        throw new Error("Expected controller options to be recorded");
      }
      expect(options.chains).toEqual([
        { rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia" },
      ]);
      expect(options.defaultChainId).toBe(ChainId.SEPOLIA.toFelt252());
      expect(options.preset).toBe("my-preset");
      expect(mockToSessionPolicies).toHaveBeenCalledWith(policies);
    });
  });
});

describe("StarkZap", () => {
  let sdk: StarkZap;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetControllerCache();
    MockController.options = [];
    MockController.prototype.probe = vi.fn().mockResolvedValue(null);
    MockController.prototype.isReady = vi.fn().mockReturnValue(true);
    sdk = new StarkZap({
      rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
      chainId: ChainId.SEPOLIA,
    });
  });

  describe("probeCartridge", () => {
    describe("in a non-web environment", () => {
      it("should throw when window is not defined", async () => {
        await expect(sdk.probeCartridge()).rejects.toThrow(
          "Cartridge is only supported in web environments"
        );
      });
    });

    describe("in a web environment", () => {
      beforeEach(() => {
        vi.stubGlobal("window", {});
        vi.stubGlobal("document", { createElement: () => ({}) });
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it("should return null when no active session exists", async () => {
        const result = await sdk.probeCartridge();

        expect(result).toBeNull();
      });

      it("should return a wallet when a valid session exists", async () => {
        MockController.prototype.probe = MockController.prototype.connect;

        const result = await sdk.probeCartridge();

        expect(result).not.toBeNull();
        expect(result?.address).toBe(
          "0x0000000000000000000000000000000000000000000000001234567890abcdef"
        );
      });

      it("should throw on RPC chain mismatch", async () => {
        vi.spyOn(sdk.getProvider(), "getChainId").mockResolvedValue(
          ChainId.MAINNET.toFelt252()
        );

        await expect(sdk.probeCartridge()).rejects.toThrow(
          "RPC chain mismatch"
        );
      });
    });
  });
});
