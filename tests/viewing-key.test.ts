import { describe, it, expect } from "vitest";
import { constants, ec, num, type Signature } from "starknet";
import {
  assertCanonicalViewingKey,
  signatureDerivation,
  type ViewingKeyContext,
} from "@/privacy/viewing-key";
import { StarkSigner, type SignerInterface } from "@/signer";
import { testPrivateKeys } from "./config";

const ORDER = ec.starkCurve.CURVE.n;
const HALF_ORDER = ORDER / 2n;

const context: ViewingKeyContext = {
  chainId: constants.StarknetChainId.SN_MAIN,
  accountAddress:
    "0x01bedf727a430f2e265bd859ef1be694f414f76bd4520e3e207e134de4f3bec8",
  poolAddress:
    "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
};

describe("signatureDerivation", () => {
  const signer = new StarkSigner(testPrivateKeys.key1);

  it("should be deterministic across calls", async () => {
    expect(await signatureDerivation(context, signer)).toBe(
      await signatureDerivation(context, signer)
    );
  });

  it("should stay within the pool's canonical key range", async () => {
    for (const key of [
      testPrivateKeys.key1,
      testPrivateKeys.key2,
      testPrivateKeys.key3,
    ]) {
      const derived = BigInt(
        await signatureDerivation(context, new StarkSigner(key))
      );

      expect(derived).toBeGreaterThanOrEqual(1n);
      expect(derived).toBeLessThan(HALF_ORDER);
    }
  });

  it("should scope the key to chain, account, pool and key index", async () => {
    const variants = await Promise.all(
      [
        context,
        { ...context, chainId: constants.StarknetChainId.SN_SEPOLIA },
        { ...context, accountAddress: "0x2" },
        { ...context, poolAddress: "0x1" },
        { ...context, keyIndex: 1 },
      ].map((scope) => signatureDerivation(scope, signer))
    );

    expect(new Set(variants).size).toBe(variants.length);
  });

  it("should normalise felt padding so 0x040... and 0x40... agree", async () => {
    const padded = await signatureDerivation(context, signer);
    const unpadded = await signatureDerivation(
      {
        ...context,
        accountAddress: num.toHex(BigInt(context.accountAddress)),
        poolAddress: num.toHex(BigInt(context.poolAddress)),
      },
      signer
    );

    expect(unpadded).toBe(padded);
  });

  it("should refuse a signer that does not declare determinism", async () => {
    // A signer with a random ECDSA nonce derives a different key every call,
    // which loses access to every note already encrypted to the first one.
    const nonDeterministic: SignerInterface = {
      getPubKey: () => Promise.resolve("0x1"),
      signRaw: () => Promise.resolve(["0x1", "0x2"] as Signature),
    };

    await expect(
      signatureDerivation(context, nonDeterministic)
    ).rejects.toThrow(/deterministic/);
  });
});

describe("assertCanonicalViewingKey", () => {
  it("should accept a key inside [1, n/2)", () => {
    expect(assertCanonicalViewingKey("0x1")).toBe(1n);
    expect(assertCanonicalViewingKey(HALF_ORDER - 1n)).toBe(HALF_ORDER - 1n);
  });

  it("should reject keys the pool would refuse", () => {
    // The upper bound is exclusive, so n/2 itself is not canonical.
    for (const key of [0n, HALF_ORDER, HALF_ORDER + 1n, ORDER]) {
      expect(() => assertCanonicalViewingKey(key)).toThrow(/canonical|range/i);
    }
  });
});
