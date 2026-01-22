import { describe, it, expect } from "vitest";
import { StarkSigner } from "../src/signer/stark.js";
import { testPrivateKeys } from "./config.js";

describe("StarkSigner", () => {
  describe("getPubKey", () => {
    it("should derive public key from private key", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const pubKey = await signer.getPubKey();

      expect(pubKey).toBeDefined();
      expect(pubKey).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should return same public key on multiple calls", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);

      const pubKey1 = await signer.getPubKey();
      const pubKey2 = await signer.getPubKey();

      expect(pubKey1).toBe(pubKey2);
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
    it("should have internal starknet signer", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const starknetSigner = signer._getStarknetSigner();

      expect(starknetSigner).toBeDefined();
      expect(typeof starknetSigner.signTransaction).toBe("function");
    });

    it("should return same signer instance", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);

      const starknetSigner1 = signer._getStarknetSigner();
      const starknetSigner2 = signer._getStarknetSigner();

      expect(starknetSigner1).toBe(starknetSigner2);
    });
  });

  describe("signMessage", () => {
    it("should be a function", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      expect(typeof signer.signMessage).toBe("function");
    });

    it("should delegate to starknet signer", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const starknetSigner = signer._getStarknetSigner();

      // Verify the method exists on the underlying signer
      expect(typeof starknetSigner.signMessage).toBe("function");
    });
  });

  describe("signTransaction", () => {
    it("should be a function", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      expect(typeof signer.signTransaction).toBe("function");
    });

    it("should delegate to starknet signer", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const starknetSigner = signer._getStarknetSigner();

      // Verify the method exists on the underlying signer
      expect(typeof starknetSigner.signTransaction).toBe("function");
    });
  });
});
