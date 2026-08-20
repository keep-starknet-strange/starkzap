import { describe, it, expect } from "vitest";
import { constants, ec, num, type Signature } from "starknet";
import {
  accountLeafDerivation,
  assertCanonicalViewingKey,
  assertViewingKeySigner,
  type ViewingKeyContext,
} from "@/privacy/viewing-key";
import {
  deriveAccountLeafViewingKey,
  StarkSigner,
  type SignerInterface,
} from "@/signer";
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

/** A signer that can sign but cannot derive — the case privacy refuses. */
const signOnly: SignerInterface = {
  getPubKey: () => Promise.resolve("0x1"),
  signRaw: () => Promise.resolve(["0x1", "0x2"] as Signature),
};

describe("deriveAccountLeafViewingKey (SNIP-44 account-leaf-v1)", () => {
  const key = testPrivateKeys.key1;

  it("should hash with HMAC-SHA256", () => {
    // The profile names HMAC-SHA256, and the implementation reads that primitive
    // off `ec.starkCurve.CURVE` rather than adding a hashing dependency. This is
    // the guard on that borrow: RFC 4231 test case 1. If a starknet upgrade
    // swapped the curve's HMAC, every key derived after it would differ from
    // every key already registered, and nothing else here would notice.
    const hmac = ec.starkCurve.CURVE.hmac;
    const digest = hmac(
      new Uint8Array(20).fill(0x0b),
      new TextEncoder().encode("Hi There")
    );

    expect(Buffer.from(digest).toString("hex")).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    );
  });

  it("should match its fixed vector", () => {
    // The pool freezes an account's registered key on first use, so a change to
    // the domain separator, the context serialization or the scalar folding does
    // not fail loudly — it silently orphans every note already encrypted. This
    // vector is what turns that into a failing test instead.
    expect(deriveAccountLeafViewingKey("0x1", context)).toBe(
      "0x257a68356447b87ac90c0e4179cc7b604ccdb4645a2389597234b2690007871"
    );
  });

  it("should be deterministic across calls", () => {
    expect(deriveAccountLeafViewingKey(key, context)).toBe(
      deriveAccountLeafViewingKey(key, context)
    );
  });

  it("should stay within the pool's canonical key range", () => {
    for (const candidate of [
      testPrivateKeys.key1,
      testPrivateKeys.key2,
      testPrivateKeys.key3,
      "0x1",
      num.toHex(ORDER - 1n),
    ]) {
      const derived = BigInt(deriveAccountLeafViewingKey(candidate, context));

      expect(derived).toBeGreaterThanOrEqual(1n);
      expect(derived).toBeLessThan(HALF_ORDER);
    }
  });

  it("should scope the key to chain, account, pool and key index", () => {
    const variants = [
      context,
      { ...context, chainId: constants.StarknetChainId.SN_SEPOLIA },
      { ...context, accountAddress: "0x2" },
      { ...context, poolAddress: "0x1" },
      { ...context, keyIndex: 1 },
    ].map((scope) => deriveAccountLeafViewingKey(key, scope));

    expect(new Set(variants).size).toBe(variants.length);
  });

  it("should treat an omitted key index as slot 0", () => {
    expect(deriveAccountLeafViewingKey(key, { ...context, keyIndex: 0 })).toBe(
      deriveAccountLeafViewingKey(key, context)
    );
  });

  it("should normalise felt padding so 0x040... and 0x40... agree", () => {
    expect(
      deriveAccountLeafViewingKey(key, {
        ...context,
        accountAddress: num.toHex(BigInt(context.accountAddress)),
        poolAddress: num.toHex(BigInt(context.poolAddress)),
      })
    ).toBe(deriveAccountLeafViewingKey(key, context));
  });

  it("should reject a private key outside the curve's scalar range", () => {
    for (const invalid of [0n, ORDER, ORDER + 1n]) {
      expect(() => deriveAccountLeafViewingKey(invalid, context)).toThrow(
        /scalar range/
      );
    }
  });
});

describe("accountLeafDerivation", () => {
  it("should delegate to the signer", async () => {
    const signer = new StarkSigner(testPrivateKeys.key1);

    expect(await accountLeafDerivation(context, signer)).toBe(
      deriveAccountLeafViewingKey(testPrivateKeys.key1, context)
    );
  });

  it("should reject a signer that cannot run the KDF", async () => {
    // Signing is not a substitute: SNIP-44 says so explicitly, because a
    // derivation signature discloses the key it derives. So there is no
    // fallback — a sign-only signer is refused rather than served.
    await expect(accountLeafDerivation(context, signOnly)).rejects.toThrow(
      /deriveViewingKey/
    );
  });
});

describe("assertViewingKeySigner", () => {
  it("should accept a signer that implements the derivation", () => {
    expect(() =>
      assertViewingKeySigner(new StarkSigner(testPrivateKeys.key1))
    ).not.toThrow();
  });

  it("should name the method and the way out", async () => {
    // The message has to carry both, because the fix is never "retry": either
    // implement the method or supply a `viewingKeyDerivation`.
    expect(() => assertViewingKeySigner(signOnly)).toThrow(/deriveViewingKey/);
    expect(() => assertViewingKeySigner(signOnly)).toThrow(
      /viewingKeyDerivation/
    );
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
