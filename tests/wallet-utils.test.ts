import { describe, it, expect, vi } from "vitest";
import type { RpcProvider } from "starknet";
import {
  assertNoGasTokenConflict,
  checkDeployed,
  ensureWalletReady,
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

    it("forwards gasToken to deploy when provided", async () => {
      const wait = vi.fn().mockResolvedValue(undefined);
      const deploy = vi.fn().mockResolvedValue({ wait });
      const isDeployed = vi.fn().mockResolvedValue(false);
      const gasToken = fromAddress("0x053c91253bc9");

      await ensureWalletReady(
        { isDeployed, deploy },
        { deploy: "if_needed", gasToken }
      );

      expect(deploy).toHaveBeenCalledWith(
        expect.objectContaining({ gasToken })
      );
    });

    it("forwards feeMode and gasToken together to deploy", async () => {
      const wait = vi.fn().mockResolvedValue(undefined);
      const deploy = vi.fn().mockResolvedValue({ wait });
      const isDeployed = vi.fn().mockResolvedValue(false);
      const gasToken = fromAddress("0x053c91253bc9");

      await ensureWalletReady(
        { isDeployed, deploy },
        { deploy: "if_needed", feeMode: "sponsored", gasToken }
      );

      expect(deploy).toHaveBeenCalledWith(
        expect.objectContaining({ feeMode: "sponsored", gasToken })
      );
    });
  });

  describe("paymasterDetails", () => {
    const gasTokenAddress = fromAddress(
      "0x053c91253bc96bfed3be381a97265e250ed0a2e2cbf1a54898ad0d2f7982f78f"
    );

    it("returns { mode: 'default', gasToken } when gasToken is provided", () => {
      const result = paymasterDetails({ gasToken: gasTokenAddress });

      expect(result.feeMode).toEqual({
        mode: "default",
        gasToken: gasTokenAddress,
      });
    });

    it("returns { mode: 'sponsored' } when gasToken is omitted", () => {
      const result = paymasterDetails();

      expect(result.feeMode).toEqual({ mode: "sponsored" });
    });

    it("returns { mode: 'sponsored' } when called with empty options", () => {
      const result = paymasterDetails({});

      expect(result.feeMode).toEqual({ mode: "sponsored" });
    });

    it("includes timeBounds when provided", () => {
      const timeBounds = { executeBefore: 12345 };
      const result = paymasterDetails({ timeBounds });

      expect(result.timeBounds).toEqual(timeBounds);
    });

    it("includes deploymentData when provided", () => {
      const deploymentData = {
        class_hash: "0xabc",
        contract_address_salt: "0xdef",
        constructor_calldata: ["0x1"],
        version: "0x1" as const,
      };
      const result = paymasterDetails({ deploymentData });

      expect(result.deploymentData).toEqual(deploymentData);
    });

    it("omits timeBounds and deploymentData when not provided", () => {
      const result = paymasterDetails({ gasToken: gasTokenAddress });

      expect(result).not.toHaveProperty("timeBounds");
      expect(result).not.toHaveProperty("deploymentData");
    });
  });

  describe("assertNoGasTokenConflict", () => {
    const gasToken = fromAddress("0x053c91253bc9");

    it("throws when feeMode is 'user_pays' and gasToken is set", () => {
      expect(() => assertNoGasTokenConflict("user_pays", gasToken)).toThrow(
        "Cannot combine feeMode 'user_pays' with gasToken"
      );
    });

    it("does not throw when feeMode is 'sponsored' and gasToken is set", () => {
      expect(() =>
        assertNoGasTokenConflict("sponsored", gasToken)
      ).not.toThrow();
    });

    it("does not throw when feeMode is undefined and gasToken is set", () => {
      expect(() => assertNoGasTokenConflict(undefined, gasToken)).not.toThrow();
    });

    it("does not throw when gasToken is undefined", () => {
      expect(() =>
        assertNoGasTokenConflict("user_pays", undefined)
      ).not.toThrow();
    });

    it("does not throw when both are undefined", () => {
      expect(() =>
        assertNoGasTokenConflict(undefined, undefined)
      ).not.toThrow();
    });
  });
});
