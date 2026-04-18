import { describe, it, expect, vi } from "vitest";
import type { RpcProvider } from "starknet";
import {
  checkDeployed,
  ensureWalletReady,
  isPaymasterMode,
  normalizeFeeMode,
  paymasterDetails,
} from "@/wallet/utils";
import { fromAddress } from "@/types";

describe("wallet utils", () => {
  const address = fromAddress(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );

  describe("checkDeployed", () => {
    it("returns true when class hash exists", async () => {
      const provider = {
        getClassHashAt: vi.fn().mockResolvedValue("0x123"),
      };

      await expect(
        checkDeployed(provider as unknown as RpcProvider, address)
      ).resolves.toBe(true);
    });

    it("returns false when contract is not deployed", async () => {
      const provider = {
        getClassHashAt: vi
          .fn()
          .mockRejectedValue(new Error("Contract not found")),
      };

      await expect(
        checkDeployed(provider as unknown as RpcProvider, address)
      ).resolves.toBe(false);
    });

    it("rethrows non-deployment RPC errors", async () => {
      const provider = {
        getClassHashAt: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      };

      await expect(
        checkDeployed(provider as unknown as RpcProvider, address)
      ).rejects.toThrow("ECONNREFUSED");
    });
  });

  describe("ensureWalletReady", () => {
    it("does not redeploy an already deployed account with deploy: always", async () => {
      const deploy = vi.fn();
      const isDeployed = vi.fn().mockResolvedValue(true);

      await ensureWalletReady(
        {
          isDeployed,
          deploy,
        },
        { deploy: "always" }
      );

      expect(isDeployed).toHaveBeenCalledTimes(1);
      expect(deploy).not.toHaveBeenCalled();
    });

    it("deploys undeployed accounts in if_needed mode", async () => {
      const wait = vi.fn().mockResolvedValue(undefined);
      const deploy = vi.fn().mockResolvedValue({ wait });
      const isDeployed = vi.fn().mockResolvedValue(false);

      await ensureWalletReady(
        {
          isDeployed,
          deploy,
        },
        { deploy: "if_needed" }
      );

      expect(deploy).toHaveBeenCalledTimes(1);
      expect(wait).toHaveBeenCalledTimes(1);
    });

    it("forwards paymaster feeMode with gasToken to deploy", async () => {
      const wait = vi.fn().mockResolvedValue(undefined);
      const deploy = vi.fn().mockResolvedValue({ wait });
      const isDeployed = vi.fn().mockResolvedValue(false);
      const gasToken = fromAddress("0x053c91253bc9");

      await ensureWalletReady(
        { isDeployed, deploy },
        { deploy: "if_needed", feeMode: { type: "paymaster", gasToken } }
      );

      expect(deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          feeMode: { type: "paymaster", gasToken },
        })
      );
    });

    it("forwards paymaster feeMode without gasToken to deploy", async () => {
      const wait = vi.fn().mockResolvedValue(undefined);
      const deploy = vi.fn().mockResolvedValue({ wait });
      const isDeployed = vi.fn().mockResolvedValue(false);

      await ensureWalletReady(
        { isDeployed, deploy },
        { deploy: "if_needed", feeMode: { type: "paymaster" } }
      );

      expect(deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          feeMode: { type: "paymaster" },
        })
      );
    });
  });

  describe("paymasterDetails", () => {
    const gasTokenAddress = fromAddress(
      "0x053c91253bc96bfed3be381a97265e250ed0a2e2cbf1a54898ad0d2f7982f78f"
    );

    it("returns { mode: 'default', gasToken } when gasToken is provided", () => {
      const result = paymasterDetails({
        feeMode: { type: "paymaster", gasToken: gasTokenAddress },
      });

      expect(result.feeMode).toEqual({
        mode: "default",
        gasToken: gasTokenAddress,
      });
    });

    it("returns { mode: 'sponsored' } when gasToken is omitted", () => {
      const result = paymasterDetails({
        feeMode: { type: "paymaster" },
      });

      expect(result.feeMode).toEqual({ mode: "sponsored" });
    });

    it("includes timeBounds when provided", () => {
      const timeBounds = { executeBefore: 12345 };
      const result = paymasterDetails({
        feeMode: { type: "paymaster" },
        timeBounds,
      });

      expect(result.timeBounds).toEqual(timeBounds);
    });

    it("includes deploymentData when provided", () => {
      const deploymentData = {
        class_hash: "0xabc",
        contract_address_salt: "0xdef",
        constructor_calldata: ["0x1"],
        version: "0x1" as const,
      };
      const result = paymasterDetails({
        feeMode: { type: "paymaster" },
        deploymentData,
      });

      expect(result.deploymentData).toEqual(deploymentData);
    });

    it("omits timeBounds and deploymentData when not provided", () => {
      const result = paymasterDetails({
        feeMode: { type: "paymaster", gasToken: gasTokenAddress },
      });

      expect(result).not.toHaveProperty("timeBounds");
      expect(result).not.toHaveProperty("deploymentData");
    });
  });

  describe("normalizeFeeMode", () => {
    it('converts deprecated "sponsored" to { type: "paymaster" }', () => {
      expect(normalizeFeeMode("sponsored")).toEqual({ type: "paymaster" });
    });

    it('passes "user_pays" through unchanged', () => {
      expect(normalizeFeeMode("user_pays")).toBe("user_pays");
    });

    it("passes paymaster object through unchanged", () => {
      const gasToken = fromAddress("0x053c91253bc9");
      const mode = { type: "paymaster" as const, gasToken };
      expect(normalizeFeeMode(mode)).toEqual(mode);
    });

    it("passes paymaster object without gasToken through unchanged", () => {
      const mode = { type: "paymaster" as const };
      expect(normalizeFeeMode(mode)).toEqual(mode);
    });
  });

  describe("isPaymasterMode", () => {
    it('returns true for { type: "paymaster" }', () => {
      expect(isPaymasterMode({ type: "paymaster" })).toBe(true);
    });

    it("returns true for paymaster with gasToken", () => {
      const gasToken = fromAddress("0x053c91253bc9");
      expect(isPaymasterMode({ type: "paymaster", gasToken })).toBe(true);
    });

    it('returns true for deprecated "sponsored"', () => {
      expect(isPaymasterMode("sponsored")).toBe(true);
    });

    it('returns false for "user_pays"', () => {
      expect(isPaymasterMode("user_pays")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isPaymasterMode(undefined)).toBe(false);
    });
  });

  describe("backward compat: deprecated sponsored alias", () => {
    it('forwards deprecated "sponsored" feeMode through ensureWalletReady to deploy', async () => {
      const wait = vi.fn().mockResolvedValue(undefined);
      const deploy = vi.fn().mockResolvedValue({ wait });
      const isDeployed = vi.fn().mockResolvedValue(false);

      await ensureWalletReady(
        { isDeployed, deploy },
        { deploy: "if_needed", feeMode: "sponsored" }
      );

      expect(deploy).toHaveBeenCalledWith(
        expect.objectContaining({
          feeMode: "sponsored",
        })
      );
    });
  });
});
