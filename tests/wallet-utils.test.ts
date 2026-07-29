import { describe, it, expect, vi } from "vitest";
import { num, shortString, type RpcProvider } from "starknet";
import {
  assertProofBaseBlockAged,
  assertProofFresh,
  assertProofSendable,
  proofBaseBlock,
  checkDeployed,
  ensureWalletReady,
  isPaymasterMode,
  normalizeFeeMode,
  paymasterDetails,
  preflightFromSimulation,
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
        address: "0x123",
        class_hash: "0xabc",
        salt: "0xdef",
        calldata: ["0x1"],
        version: 1 as const,
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

  describe("assertProofSendable", () => {
    const proof = { data: "0xdeadbeef", proofFacts: ["0x1", "0x2"] };

    it("allows a self-submitted proof once the caller acknowledges the cost", () => {
      expect(() =>
        assertProofSendable(proof, "user_pays", "Wallet", true)
      ).not.toThrow();
    });

    it("refuses to self-submit a proof by default", () => {
      // Self-submission works on-chain, which is exactly why it needs a gate:
      // nothing would tell the caller their address is now on the transaction.
      expect(() => assertProofSendable(proof, "user_pays", "Wallet")).toThrow(
        "Refusing to self-submit"
      );
    });

    it("is a no-op when there is no proof", () => {
      expect(() =>
        assertProofSendable(undefined, { type: "paymaster" }, "CartridgeWallet")
      ).not.toThrow();
    });

    it("rejects a proof on the SNIP-29 paymaster path", () => {
      expect(() =>
        assertProofSendable(proof, { type: "paymaster" }, "Wallet", true)
      ).toThrow("SNIP-29 paymaster cannot carry a transaction proof");
    });

    it("rejects a proof on the deprecated sponsored alias", () => {
      expect(() =>
        assertProofSendable(proof, "sponsored", "Wallet", true)
      ).toThrow("SNIP-29 paymaster cannot carry a transaction proof");
    });

    it("checks the wallet before the fee mode", () => {
      // A Cartridge wallet cannot derive a viewing key at all, so that refusal
      // is the more useful one to surface even on the paymaster path.
      expect(() =>
        assertProofSendable(proof, { type: "paymaster" }, "CartridgeWallet")
      ).toThrow("CartridgeWallet cannot send proof-carrying transactions");
    });

    it("rejects a proof on a non-Wallet implementation", () => {
      expect(() =>
        assertProofSendable(proof, "user_pays", "CartridgeWallet", true)
      ).toThrow("CartridgeWallet cannot send proof-carrying transactions");
    });
  });

  describe("proofBaseBlock / assertProofBaseBlockAged", () => {
    /** Facts in the shape the proving service emits: tag, then payload. */
    function factsWithBase(block: number): string[] {
      return [
        num.toHex(shortString.encodeShortString("PROOF1")),
        num.toHex(shortString.encodeShortString("VIRTUAL_SNOS")),
        "0x53f6c9",
        num.toHex(shortString.encodeShortString("VIRTUAL_SNOS0")),
        num.toHex(block),
        "0x7b0a26",
      ];
    }

    it("reads the base block from the felt after the VIRTUAL_SNOS0 tag", () => {
      expect(
        proofBaseBlock({ data: "0x1", proofFacts: factsWithBase(12621393) })
      ).toBe(12621393);
    });

    it("returns undefined when the tag is absent", () => {
      // The layout belongs to the proving service. An unrecognised shape must
      // read as "cannot tell", never as "block zero".
      expect(
        proofBaseBlock({ data: "0x1", proofFacts: ["0x1", "0x2"] })
      ).toBeUndefined();
    });

    it("returns undefined when the tag is the last fact", () => {
      expect(
        proofBaseBlock({
          data: "0x1",
          proofFacts: [
            num.toHex(shortString.encodeShortString("VIRTUAL_SNOS0")),
          ],
        })
      ).toBeUndefined();
    });

    it("accepts a base block at exactly the required depth", () => {
      expect(() =>
        assertProofBaseBlockAged(
          { data: "0x1", proofFacts: factsWithBase(100) },
          110,
          10
        )
      ).not.toThrow();
    });

    it("rejects a base block that is too recent", () => {
      expect(() =>
        assertProofBaseBlockAged(
          { data: "0x1", proofFacts: factsWithBase(105) },
          110,
          10
        )
      ).toThrow("generated against block 105, only 5 block(s) behind");
    });

    it("skips the RPC entirely when there is no base block to check", async () => {
      // An unrecognised proof shape must not cost a round-trip.
      const provider = {
        getBlockNumber: vi.fn(),
      } as unknown as RpcProvider;

      await expect(
        assertProofFresh({ data: "0x1", proofFacts: ["0x1"] }, provider, 10)
      ).resolves.toBeUndefined();
      expect(provider.getBlockNumber).not.toHaveBeenCalled();
    });

    it("rejects a too-recent proof once the head is known", async () => {
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(110),
      } as unknown as RpcProvider;

      await expect(
        assertProofFresh(
          { data: "0x1", proofFacts: factsWithBase(105) },
          provider,
          10
        )
      ).rejects.toThrow("only 5 block(s) behind");
    });

    it("does not block a transaction when the head cannot be read", async () => {
      // The check is advisory. A provider hiccup must not be the reason an
      // otherwise-valid privacy transaction fails.
      const provider = {
        getBlockNumber: vi.fn().mockRejectedValue(new Error("rpc down")),
      } as unknown as RpcProvider;

      await expect(
        assertProofFresh(
          { data: "0x1", proofFacts: factsWithBase(105) },
          provider,
          10
        )
      ).resolves.toBeUndefined();
    });

    it("lets a proof through when the base block cannot be read", () => {
      expect(() =>
        assertProofBaseBlockAged({ data: "0x1", proofFacts: ["0x1"] }, 110, 10)
      ).not.toThrow();
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

  describe("preflightFromSimulation", () => {
    const reverted = (reason: unknown) => [
      { transaction_trace: { execute_invocation: { revert_reason: reason } } },
    ];
    const succeeded = [{ transaction_trace: { execute_invocation: {} } }];

    it("reads a revert reason from both response shapes identically", () => {
      // v10 returns `{ simulated_transactions }`, v8/v9 a bare array.
      expect(
        preflightFromSimulation({ simulated_transactions: reverted("boom") })
      ).toEqual({ ok: false, reason: "boom" });
      expect(preflightFromSimulation(reverted("boom"))).toEqual({
        ok: false,
        reason: "boom",
      });
    });

    it("passes a successful simulation in both response shapes", () => {
      expect(
        preflightFromSimulation({ simulated_transactions: succeeded })
      ).toEqual({ ok: true });
      expect(preflightFromSimulation(succeeded)).toEqual({ ok: true });
    });

    it("reports a failure when revert_reason is present but not a string", () => {
      // An empty string is still a revert; only absence means success.
      expect(preflightFromSimulation(reverted(""))).toEqual({
        ok: false,
        reason: "",
      });
      expect(preflightFromSimulation(reverted({ nested: true }))).toEqual({
        ok: false,
        reason: "Simulation failed",
      });
    });

    it("passes unreadable responses rather than blocking the transaction", () => {
      for (const simulation of [
        undefined,
        null,
        {},
        [],
        { simulated_transactions: [] },
        { simulated_transactions: "not-an-array" },
        [{ no_trace: true }],
        [{ transaction_trace: { execute_invocation: "nope" } }],
      ]) {
        expect(preflightFromSimulation(simulation)).toEqual({ ok: true });
      }
    });
  });
});
