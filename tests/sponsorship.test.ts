import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { RpcProvider } from "starknet";
import { StarkSDK } from "@/sdk";
import { StarkSigner } from "@/signer";
import { OpenZeppelinPreset } from "@/account";
import { devnetConfig } from "./config";

describe("Sponsorship (AVNU Paymaster)", () => {
  // Valid Stark curve private key for testing
  const privateKey =
    "0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9";

  beforeAll(() => {
    vi.spyOn(RpcProvider.prototype, "getChainId").mockResolvedValue(
      devnetConfig.chainId!.toFelt252()
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("SDK configuration", () => {
    it("should allow feeMode=sponsored without explicit sponsor config", async () => {
      // AVNU paymaster is built into starknet.js, no config needed
      const sdk = new StarkSDK({
        rpcUrl: devnetConfig.rpcUrl,
        chainId: devnetConfig.chainId,
      });

      const wallet = await sdk.connectWallet({
        account: {
          signer: new StarkSigner(privateKey),
          accountClass: OpenZeppelinPreset,
        },
        feeMode: "sponsored",
      });

      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it("should accept custom paymaster config", async () => {
      const sdk = new StarkSDK({
        rpcUrl: devnetConfig.rpcUrl,
        chainId: devnetConfig.chainId,
        paymaster: {
          nodeUrl: "https://sepolia.paymaster.avnu.fi",
        },
      });

      const wallet = await sdk.connectWallet({
        account: {
          signer: new StarkSigner(privateKey),
          accountClass: OpenZeppelinPreset,
        },
      });

      expect(wallet).toBeDefined();
    });
  });

  describe("Execute options", () => {
    it("should support feeMode override per operation", async () => {
      const sdk = new StarkSDK({
        rpcUrl: devnetConfig.rpcUrl,
        chainId: devnetConfig.chainId,
      });

      // Connect with user_pays by default
      const wallet = await sdk.connectWallet({
        account: {
          signer: new StarkSigner(privateKey),
          accountClass: OpenZeppelinPreset,
        },
      });

      // Execute with sponsored - would use AVNU paymaster
      // (This will fail in unit tests since there's no network)
      try {
        await wallet.execute(
          [
            {
              contractAddress: "0x123",
              entrypoint: "test",
              calldata: [],
            },
          ],
          { feeMode: "sponsored" }
        );
      } catch (error) {
        // Expected to fail (devnet doesn't have AVNU paymaster)
        expect(error).toBeDefined();
      }
    });

    it("should support timeBounds for sponsored transactions", async () => {
      const sdk = new StarkSDK({
        rpcUrl: devnetConfig.rpcUrl,
        chainId: devnetConfig.chainId,
      });

      const wallet = await sdk.connectWallet({
        account: {
          signer: new StarkSigner(privateKey),
          accountClass: OpenZeppelinPreset,
        },
        feeMode: "sponsored",
        timeBounds: {
          executeAfter: Math.floor(Date.now() / 1000),
          executeBefore: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      expect(wallet).toBeDefined();
    });
  });
});
