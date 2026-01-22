import { describe, it, expect } from "vitest";
import { AccountProvider } from "../src/wallet/accounts/provider.js";
import { StarkSigner } from "../src/signer/stark.js";
import {
  OpenZeppelinPreset,
  ArgentPreset,
  BraavosPreset,
} from "../src/account/presets.js";
import { testPrivateKeys } from "./config.js";

describe("AccountProvider", () => {
  describe("constructor", () => {
    it("should use OpenZeppelin preset by default", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer);

      expect(provider.getClassHash()).toBe(OpenZeppelinPreset.classHash);
    });

    it("should use provided account class", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, ArgentPreset);

      expect(provider.getClassHash()).toBe(ArgentPreset.classHash);
    });
  });

  describe("getAddress", () => {
    it("should compute address from signer and account class", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer);

      const address = await provider.getAddress();

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should cache the address", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer);

      const address1 = await provider.getAddress();
      const address2 = await provider.getAddress();

      expect(address1).toBe(address2);
    });

    it("should compute different addresses for different account classes", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const ozProvider = new AccountProvider(signer, OpenZeppelinPreset);
      const argentProvider = new AccountProvider(signer, ArgentPreset);

      const ozAddress = await ozProvider.getAddress();
      const argentAddress = await argentProvider.getAddress();

      expect(ozAddress).not.toBe(argentAddress);
    });
  });

  describe("getPublicKey", () => {
    it("should return public key from signer", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer);

      const pubKey = await provider.getPublicKey();

      expect(pubKey).toBeDefined();
      expect(pubKey).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should cache the public key", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer);

      const pubKey1 = await provider.getPublicKey();
      const pubKey2 = await provider.getPublicKey();

      expect(pubKey1).toBe(pubKey2);
    });
  });

  describe("getSigner", () => {
    it("should return the signer", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer);

      expect(provider.getSigner()).toBe(signer);
    });
  });

  describe("getClassHash", () => {
    it("should return class hash for OpenZeppelin", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, OpenZeppelinPreset);

      expect(provider.getClassHash()).toBe(OpenZeppelinPreset.classHash);
    });

    it("should return class hash for Argent", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, ArgentPreset);

      expect(provider.getClassHash()).toBe(ArgentPreset.classHash);
    });

    it("should return class hash for Braavos", () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, BraavosPreset);

      expect(provider.getClassHash()).toBe(BraavosPreset.classHash);
    });
  });

  describe("getConstructorCalldata", () => {
    it("should build OpenZeppelin calldata", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, OpenZeppelinPreset);

      const pubKey = await provider.getPublicKey();
      const calldata = provider.getConstructorCalldata(pubKey);

      expect(calldata).toBeDefined();
      expect(Array.isArray(calldata)).toBe(true);
    });

    it("should build Argent calldata", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, ArgentPreset);

      const pubKey = await provider.getPublicKey();
      const calldata = provider.getConstructorCalldata(pubKey);

      expect(calldata).toBeDefined();
      expect(Array.isArray(calldata)).toBe(true);
    });

    it("should build Braavos calldata", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const provider = new AccountProvider(signer, BraavosPreset);

      const pubKey = await provider.getPublicKey();
      const calldata = provider.getConstructorCalldata(pubKey);

      expect(calldata).toBeDefined();
      expect(Array.isArray(calldata)).toBe(true);
    });
  });
});
