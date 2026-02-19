import { describe, it, expect, vi } from "vitest";
import type { RpcProvider } from "starknet";
import { checkDeployed, ensureWalletReady } from "@/wallet/utils";
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
  });
});
