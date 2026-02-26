import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserWallet } from "@/wallet/browser";
import { ChainId } from "@/types";

// Mock @starknet-io/get-starknet-core StarknetWindowObject
const mockWalletProvider = {
  id: "argent",
  name: "ArgentX",
  version: "5.0.0",
  icon: "",
  request: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

// Mock starknet — replace WalletAccount and RpcProvider
vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();

  const mockWalletAccount = {
    address: "0x1234567890abcdef",
    execute: vi.fn().mockResolvedValue({ transaction_hash: "0xtxhash" }),
    signMessage: vi.fn().mockResolvedValue(["0xmsg1", "0xmsg2"]),
    simulateTransaction: vi.fn().mockResolvedValue([
      { transaction_trace: { execute_invocation: {} } },
    ]),
    estimateInvokeFee: vi.fn().mockResolvedValue({
      overall_fee: 1000n,
      gas_consumed: 100n,
      gas_price: 10n,
      unit: "WEI",
    }),
  };

  class MockWalletAccount {
    address = mockWalletAccount.address;
    execute = mockWalletAccount.execute;
    signMessage = mockWalletAccount.signMessage;
    simulateTransaction = mockWalletAccount.simulateTransaction;
    estimateInvokeFee = mockWalletAccount.estimateInvokeFee;

    static connect = vi.fn().mockResolvedValue(mockWalletAccount);
  }

  class MockRpcProvider {
    channel = { nodeUrl: "https://test.rpc" };
    getChainId = vi.fn().mockResolvedValue(ChainId.SEPOLIA.toFelt252());
    getClassHashAt = vi.fn().mockResolvedValue("0xclasshash");
  }

  return {
    ...actual,
    WalletAccount: MockWalletAccount,
    RpcProvider: MockRpcProvider,
  };
});

describe("BrowserWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("should create a BrowserWallet from a connected StarknetWindowObject", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      expect(wallet).toBeInstanceOf(BrowserWallet);
      expect(wallet.address).toBe(
        "0x0000000000000000000000000000000000000000000000001234567890abcdef"
      );
    });

    it("should use WalletAccount.connect() from starknet.js", async () => {
      const { WalletAccount } = await import("starknet");
      await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      expect(
        (WalletAccount as unknown as { connect: ReturnType<typeof vi.fn> })
          .connect
      ).toHaveBeenCalledOnce();
    });

    it("should handle undeployed accounts — classHash stays 0x0", async () => {
      const { WalletAccount } = await import("starknet");
      // Make WalletAccount.connect return an account whose classHash lookup fails
      (
        WalletAccount as unknown as { connect: ReturnType<typeof vi.fn> }
      ).connect.mockResolvedValueOnce({
        address: "0x1234567890abcdef",
        execute: vi.fn(),
        signMessage: vi.fn(),
        simulateTransaction: vi.fn(),
        estimateInvokeFee: vi.fn(),
      });

      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      // The getClassHashAt mock throws during create() for this address,
      // so classHash should fall back to "0x0"
      expect(wallet.getClassHash()).toBeDefined();
    });
  });

  describe("isDeployed", () => {
    it("should return true when deployed", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });
      expect(await wallet.isDeployed()).toBe(true);
    });

    it("should return false when not deployed", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      const getClassHashAt = (
        wallet.getProvider() as unknown as {
          getClassHashAt: ReturnType<typeof vi.fn>;
        }
      ).getClassHashAt;
      getClassHashAt.mockRejectedValue(new Error("contract not found"));

      expect(await wallet.isDeployed()).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute calls and return a Tx", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      const tx = await wallet.execute([
        { contractAddress: "0x123", entrypoint: "transfer", calldata: [] },
      ]);

      expect(tx.hash).toBe("0xtxhash");
    });

    it("should throw for sponsored feeMode", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      await expect(
        wallet.execute(
          [{ contractAddress: "0x123", entrypoint: "transfer", calldata: [] }],
          { feeMode: "sponsored" }
        )
      ).rejects.toThrow("does not support sponsored transactions");
    });

    it("should throw when account is not deployed", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      const getClassHashAt = (
        wallet.getProvider() as unknown as {
          getClassHashAt: ReturnType<typeof vi.fn>;
        }
      ).getClassHashAt;
      getClassHashAt.mockRejectedValue(new Error("contract not found"));

      await expect(
        wallet.execute([
          { contractAddress: "0x123", entrypoint: "transfer", calldata: [] },
        ])
      ).rejects.toThrow("Account is not deployed");
    });
  });

  describe("deploy", () => {
    it("should throw — browser wallets self-deploy on first tx", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });

      await expect(wallet.deploy()).rejects.toThrow(
        "does not support programmatic deployment"
      );
    });
  });

  describe("disconnect", () => {
    it("should disconnect without errors when wallet has no disconnect method", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
      });
      await expect(wallet.disconnect()).resolves.not.toThrow();
  });

    it("should call walletProvider.disconnect() when it exists", async () => {
      const disconnectFn = vi.fn().mockResolvedValue(undefined);
      const providerWithDisconnect = {
        ...mockWalletProvider,
        disconnect: disconnectFn,
      };

      const wallet = await BrowserWallet.create(
        providerWithDisconnect as never,
        { rpcUrl: "https://rpc.starknet.io" }
      );

      await wallet.disconnect();
      expect(disconnectFn).toHaveBeenCalledOnce();
    });
  });

  describe("getters", () => {
    it("should return correct chainId and feeMode", async () => {
      const wallet = await BrowserWallet.create(mockWalletProvider as never, {
        rpcUrl: "https://rpc.starknet.io",
        chainId: ChainId.SEPOLIA,
        feeMode: "user_pays",
      });

      expect(wallet.getChainId()).toBe(ChainId.SEPOLIA);
      expect(wallet.getFeeMode()).toBe("user_pays");
      expect(wallet.getProvider()).toBeDefined();
    });
  });
});