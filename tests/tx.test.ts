import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RpcProvider, TransactionFinalityStatus } from "starknet";
import { Tx } from "@/tx";
import { ChainId } from "@/types";
import { getTestConfig } from "./config.js";

const SEPOLIA = ChainId.SEPOLIA;
const MAINNET = ChainId.MAINNET;

describe("Tx", () => {
  const { config } = getTestConfig();

  describe("explorer URL", () => {
    it("should build voyager explorer URL for testnet", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.example.com",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, SEPOLIA, { provider: "voyager" });

      expect(tx.explorerUrl).toBe("https://sepolia.voyager.online/tx/0x123abc");
    });

    it("should build starkscan explorer URL", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.example.com",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, SEPOLIA, { provider: "starkscan" });

      expect(tx.explorerUrl).toBe("https://sepolia.starkscan.co/tx/0x123abc");
    });

    it("should use custom base URL", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.example.com",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, SEPOLIA, {
        baseUrl: "https://my-explorer.com",
      });

      expect(tx.explorerUrl).toBe("https://my-explorer.com/tx/0x123abc");
    });

    it("should preserve custom base URL path prefix", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.example.com",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, SEPOLIA, {
        baseUrl: "https://my-explorer.com/app",
      });

      expect(tx.explorerUrl).toBe("https://my-explorer.com/app/tx/0x123abc");
    });

    it("should default to voyager when no explorer config", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.example.com",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, SEPOLIA);

      expect(tx.explorerUrl).toBe("https://sepolia.voyager.online/tx/0x123abc");
    });

    it("should use mainnet URL for voyager", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://rpc.mycompany.com/starknet",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, MAINNET, { provider: "voyager" });

      expect(tx.explorerUrl).toBe("https://voyager.online/tx/0x123abc");
    });

    it("should use mainnet URL for starkscan", () => {
      const provider = new RpcProvider({
        nodeUrl: "https://rpc.mycompany.com/starknet",
      });
      const hash = "0x123abc";

      const tx = new Tx(hash, provider, MAINNET, { provider: "starkscan" });

      expect(tx.explorerUrl).toBe("https://starkscan.co/tx/0x123abc");
    });

    it("should store hash correctly", () => {
      const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
      const hash = "0xdeadbeef";

      const tx = new Tx(hash, provider, SEPOLIA);

      expect(tx.hash).toBe(hash);
    });
  });

  describe("wait", () => {
    const createMockProvider = (overrides = {}) =>
      ({
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        ...overrides,
      }) as unknown as RpcProvider;

    it("should call provider.waitForTransaction", async () => {
      const mockProvider = createMockProvider({
        waitForTransaction: vi.fn().mockResolvedValue({}),
      });

      const tx = new Tx("0x123", mockProvider, SEPOLIA);

      await tx.wait({
        successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
      });

      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith(
        "0x123",
        expect.objectContaining({
          successStates: expect.arrayContaining([
            TransactionFinalityStatus.ACCEPTED_ON_L2,
          ]),
        })
      );
    });

    it("should use default options when none provided", async () => {
      const mockProvider = createMockProvider({
        waitForTransaction: vi.fn().mockResolvedValue({}),
      });

      const tx = new Tx("0x123", mockProvider, SEPOLIA);

      await tx.wait();

      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith(
        "0x123",
        expect.objectContaining({
          successStates: expect.arrayContaining([
            TransactionFinalityStatus.ACCEPTED_ON_L2,
            TransactionFinalityStatus.ACCEPTED_ON_L1,
          ]),
        })
      );
    });
  });

  describe("receipt", () => {
    it("should fetch transaction receipt", async () => {
      const mockReceipt = {
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
        transaction_hash: "0x123",
      };
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      const receipt = await tx.receipt();

      expect(receipt).toEqual(mockReceipt);
      expect(mockProvider.getTransactionReceipt).toHaveBeenCalledWith("0x123");
    });

    it("should cache the receipt", async () => {
      const mockReceipt = {
        transaction_hash: "0x123",
        finality_status: "ACCEPTED_ON_L2",
        execution_status: "SUCCEEDED",
      };
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);

      await tx.receipt();
      await tx.receipt();
      await tx.receipt();

      // Should only be called once due to caching
      expect(mockProvider.getTransactionReceipt).toHaveBeenCalledTimes(1);
    });

    it("should not cache non-final receipts", async () => {
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionReceipt: vi
          .fn()
          .mockResolvedValue({ transaction_hash: "0x123" }),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      await tx.receipt();
      await tx.receipt();

      expect(mockProvider.getTransactionReceipt).toHaveBeenCalledTimes(2);
    });
  });

  describe("watch", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should call callback with status updates", async () => {
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionStatus: vi.fn().mockResolvedValue({
          finality_status: "RECEIVED",
          execution_status: undefined,
        }),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      const callback = vi.fn();

      const unsubscribe = tx.watch(callback);

      // Let the first poll happen
      await vi.advanceTimersByTimeAsync(0);

      expect(callback).toHaveBeenCalledWith({
        finality: "RECEIVED",
        execution: undefined,
      });

      unsubscribe();
    });

    it("should stop polling when unsubscribe is called", async () => {
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionStatus: vi.fn().mockResolvedValue({
          finality_status: "RECEIVED",
        }),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      const callback = vi.fn();

      const unsubscribe = tx.watch(callback);

      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      // Advance time past several poll intervals
      await vi.advanceTimersByTimeAsync(20000);

      // Should still only be 1 call since we unsubscribed
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should stop polling when transaction reaches final status", async () => {
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionStatus: vi.fn().mockResolvedValue({
          finality_status: "ACCEPTED_ON_L2",
          execution_status: "SUCCEEDED",
        }),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      const callback = vi.fn();

      tx.watch(callback);

      await vi.advanceTimersByTimeAsync(0);

      // Callback should be called once with final status
      expect(callback).toHaveBeenCalledWith({
        finality: "ACCEPTED_ON_L2",
        execution: "SUCCEEDED",
      });

      // Advance time and verify no more calls
      await vi.advanceTimersByTimeAsync(20000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should continue polling on errors", async () => {
      let callCount = 0;
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionStatus: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("Network error"));
          }
          return Promise.resolve({
            finality_status: "ACCEPTED_ON_L2",
            execution_status: "SUCCEEDED",
          });
        }),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      const callback = vi.fn();

      const unsubscribe = tx.watch(callback);

      // First poll - error, no callback
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).not.toHaveBeenCalled();

      // Wait for retry interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(callback).toHaveBeenCalledWith({
        finality: "ACCEPTED_ON_L2",
        execution: "SUCCEEDED",
      });

      unsubscribe();
    });

    it("should stop on REVERTED status", async () => {
      const mockProvider = {
        channel: { nodeUrl: "https://starknet-sepolia.example.com" },
        getTransactionStatus: vi.fn().mockResolvedValue({
          finality_status: "RECEIVED",
          execution_status: "REVERTED",
        }),
      } as unknown as RpcProvider;

      const tx = new Tx("0x123", mockProvider, SEPOLIA);
      const callback = vi.fn();

      tx.watch(callback);

      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledWith({
        finality: "RECEIVED",
        execution: "REVERTED",
      });

      // Advance time and verify no more calls (stopped due to REVERTED)
      await vi.advanceTimersByTimeAsync(20000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
