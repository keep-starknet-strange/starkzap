import { describe, it, expect, vi } from "vitest";
import { EDataAvailabilityMode } from "starknet";
import { StarkSigner } from "../src/index.js";
import { testPrivateKeys, devnetAccount } from "./config.js";

describe("StarkSigner", () => {
  describe("getPubKey", () => {
    it("should derive public key from private key", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const pubKey = await signer.getPubKey();

      expect(pubKey).toBeDefined();
      expect(pubKey).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should cache public key in constructor", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);

      // Check that private publicKey property is set during construction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((signer as any).publicKey).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((signer as any).publicKey).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should return cached public key on multiple calls", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);

      // Verify the cached value is returned
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cachedValue = (signer as any).publicKey;
      const pubKey1 = await signer.getPubKey();
      const pubKey2 = await signer.getPubKey();

      expect(pubKey1).toBe(cachedValue);
      expect(pubKey2).toBe(cachedValue);
    });

    it("should derive different public keys for different private keys", async () => {
      const signer1 = new StarkSigner(testPrivateKeys.key1);
      const signer2 = new StarkSigner(testPrivateKeys.key2);

      const pubKey1 = await signer1.getPubKey();
      const pubKey2 = await signer2.getPubKey();

      expect(pubKey1).not.toBe(pubKey2);
    });
  });

  describe("_getStarknetSigner", () => {
    it("should have internal starknet signer set in constructor", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);

      // Check that private signer property is set during construction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((signer as any).signer).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (signer as any).signer.signTransaction).toBe("function");
    });

    it("should return the cached signer instance", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);

      // Verify _getStarknetSigner returns the cached private signer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cachedSigner = (signer as any).signer;
      const starknetSigner1 = signer._getStarknetSigner();
      const starknetSigner2 = signer._getStarknetSigner();

      expect(starknetSigner1).toBe(cachedSigner);
      expect(starknetSigner2).toBe(cachedSigner);
    });
  });

  describe("signMessage", () => {
    it("should call underlying signer signMessage", async () => {
      const signer = new StarkSigner(devnetAccount.privateKey);
      const starknetSigner = signer._getStarknetSigner();

      // Mock the underlying signer
      const mockSignature = ["0x123", "0x456"];
      const signMessageSpy = vi
        .spyOn(starknetSigner, "signMessage")
        .mockResolvedValue(mockSignature);

      const typedData = {
        types: {
          StarknetDomain: [
            { name: "name", type: "shortstring" },
            { name: "version", type: "shortstring" },
            { name: "chainId", type: "shortstring" },
          ],
          Message: [{ name: "content", type: "felt" }],
        },
        primaryType: "Message" as const,
        domain: {
          name: "TestApp",
          version: "1",
          chainId: "SN_SEPOLIA",
        },
        message: {
          content: "0x1234",
        },
      };

      const signature = await signer.signMessage(
        typedData,
        devnetAccount.address
      );

      expect(signMessageSpy).toHaveBeenCalledWith(
        typedData,
        devnetAccount.address
      );
      expect(signature).toEqual(mockSignature);

      signMessageSpy.mockRestore();
    });
  });

  describe("signTransaction", () => {
    it("should call underlying signer signTransaction", async () => {
      const signer = new StarkSigner(devnetAccount.privateKey);
      const starknetSigner = signer._getStarknetSigner();

      // Mock the underlying signer
      const mockSignature = ["0xabc", "0xdef"];
      const signTransactionSpy = vi
        .spyOn(starknetSigner, "signTransaction")
        .mockResolvedValue(mockSignature);

      const calls = [
        {
          contractAddress: "0x123",
          entrypoint: "transfer",
          calldata: ["0x456", "100", "0"],
        },
      ];

      const transactionDetails = {
        walletAddress: devnetAccount.address,
        chainId: "0x534e5f5345504f4c4941" as const,
        nonce: 0n,
        version: "0x3" as const,
        maxFee: 0n,
        cairoVersion: "1" as const,
        resourceBounds: {
          l1_gas: { max_amount: 1000n, max_price_per_unit: 1000000n },
          l2_gas: { max_amount: 0n, max_price_per_unit: 0n },
          l1_data_gas: { max_amount: 0n, max_price_per_unit: 0n },
        },
        tip: 0n,
        paymasterData: [],
        accountDeploymentData: [],
        nonceDataAvailabilityMode: EDataAvailabilityMode.L1,
        feeDataAvailabilityMode: EDataAvailabilityMode.L1,
      };

      const signature = await signer.signTransaction(calls, transactionDetails);

      expect(signTransactionSpy).toHaveBeenCalledWith(
        calls,
        transactionDetails
      );
      expect(signature).toEqual(mockSignature);

      signTransactionSpy.mockRestore();
    });
  });
});
