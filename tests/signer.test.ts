import { describe, it, expect } from "vitest";
import { StarkSigner } from "../src/signer/stark.js";
import { SignerAdapter } from "../src/signer/adapter.js";
import { testPrivateKeys } from "./config.js";

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

  describe("signRaw", () => {
    it("should sign a message hash", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const hash =
        "0x7ac3d3a1c64937d2459740b1e76319efd3b305829d59987ca2961ff65ace734";

      const signature = await signer.signRaw(hash);

      expect(signature).toHaveLength(2);
      expect(signature[0]).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signature[1]).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it("should produce consistent signatures for same hash", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const hash =
        "0x7ac3d3a1c64937d2459740b1e76319efd3b305829d59987ca2961ff65ace734";

      const sig1 = await signer.signRaw(hash);
      const sig2 = await signer.signRaw(hash);

      expect(sig1).toEqual(sig2);
    });

    it("should produce different signatures for different hashes", async () => {
      const signer = new StarkSigner(testPrivateKeys.key1);
      const hash1 =
        "0x7ac3d3a1c64937d2459740b1e76319efd3b305829d59987ca2961ff65ace734";
      // Use a valid Stark field element (< 2^251)
      const hash2 =
        "0x01c707ea7771c277429b7e8c8e976c15022e962da430f863f1331a2c8cae8829";

      const sig1 = await signer.signRaw(hash1);
      const sig2 = await signer.signRaw(hash2);

      expect(sig1).not.toEqual(sig2);
    });
  });
});

describe("SignerAdapter", () => {
  it("should wrap a SignerInterface and provide starknet.js compatibility", async () => {
    const signer = new StarkSigner(testPrivateKeys.key1);
    const adapter = new SignerAdapter(signer);

    // Adapter should delegate getPubKey
    const pubKey = await adapter.getPubKey();
    expect(pubKey).toBe(await signer.getPubKey());
  });

  it("should have all required starknet.js SignerInterface methods", () => {
    const signer = new StarkSigner(testPrivateKeys.key1);
    const adapter = new SignerAdapter(signer);

    expect(typeof adapter.getPubKey).toBe("function");
    expect(typeof adapter.signMessage).toBe("function");
    expect(typeof adapter.signTransaction).toBe("function");
    expect(typeof adapter.signDeployAccountTransaction).toBe("function");
    expect(typeof adapter.signDeclareTransaction).toBe("function");
  });
});
