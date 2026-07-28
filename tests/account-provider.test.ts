import { describe, it, expect } from "vitest";
import { constants, ec } from "starknet";
import { AccountProvider } from "@/wallet/accounts/provider";
import { StarkSigner } from "@/signer";
import {
  OpenZeppelinPreset,
  ArgentPreset,
  BraavosPreset,
  ArgentXV050Preset,
  DevnetPreset,
} from "@/account";
import { testPrivateKeys } from "./config";

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
      expect(pubKey).toBe(await signer.getPubKey());
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

  describe("getViewingKey", () => {
    const scope = {
      chainId: constants.StarknetChainId.SN_MAIN as string,
      poolAddress:
        "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
    };

    it("should be deterministic across calls", async () => {
      const provider = new AccountProvider(
        new StarkSigner(testPrivateKeys.key1)
      );

      expect(await provider.getViewingKey(scope)).toBe(
        await provider.getViewingKey(scope)
      );
    });

    it("should depend only on the signer, not the account class", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const keys = await Promise.all(
        [
          OpenZeppelinPreset,
          ArgentPreset,
          ArgentXV050Preset,
          BraavosPreset,
          DevnetPreset,
        ].map((preset) =>
          new AccountProvider(signer, preset).getViewingKey(scope)
        )
      );

      expect(new Set(keys).size).toBe(1);
    });

    it("should be scoped to chain and pool", async () => {
      const provider = new AccountProvider(
        new StarkSigner(testPrivateKeys.key1)
      );

      const mainnet = await provider.getViewingKey(scope);
      const sepolia = await provider.getViewingKey({
        ...scope,
        chainId: constants.StarknetChainId.SN_SEPOLIA,
      });
      const otherPool = await provider.getViewingKey({
        ...scope,
        poolAddress: "0x1",
      });

      expect(new Set([mainnet, sepolia, otherPool]).size).toBe(3);
    });

    it("should stay within the pool's canonical key range", async () => {
      const max = ec.starkCurve.CURVE.n / 2n;

      const keys = [
        testPrivateKeys.key1,
        testPrivateKeys.key2,
        testPrivateKeys.key3,
      ];

      for (const key of keys) {
        const provider = new AccountProvider(new StarkSigner(key));
        const viewingKey = BigInt(await provider.getViewingKey(scope));

        expect(viewingKey).toBeGreaterThanOrEqual(1n);
        expect(viewingKey).toBeLessThan(max);
      }
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
