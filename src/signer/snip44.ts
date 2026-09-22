import { ec, encode, num } from "starknet";
import type { ViewingKeyContext } from "@/signer/interface";

/** Stark curve order. */
const ORDER = ec.starkCurve.CURVE.n;

/** Exclusive upper bound of the range the pool accepts: `1 <= k < n / 2`. */
const HALF_ORDER = ORDER / 2n;

/**
 * Largest multiple of `n` that fits in 256 bits.
 *
 * Digests at or above this are rejected, not reduced. Reducing them would bias
 * the result toward low scalars.
 */
const LIMIT = 2n ** 256n - (2n ** 256n % ORDER);

/** The profile's domain separator, exact and case-sensitive. */
const DOMAIN_SEPARATOR = "STRK20_ACCOUNT_LEAF_V1";

/** Version folded into the serialized context. */
const CONTEXT_VERSION = 1n;

/** Serialized context width the profile fixes: 4 + 32 + 32 + 32 + 16. */
const CONTEXT_BYTES = 116;

/**
 * HMAC-SHA256, taken from the curve starknet already carries.
 *
 * This avoids a hashing dependency and works on React Native, where it is pure
 * JavaScript.
 */
function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const hmac = ec.starkCurve.CURVE.hmac;
  if (typeof hmac !== "function") {
    throw new Error(
      "[starkzap] `ec.starkCurve.CURVE.hmac` is missing, so the SNIP-44 " +
        "viewing-key derivation cannot run. A starknet upgrade has changed the " +
        "curve definition; the derivation needs an HMAC-SHA256 to stay " +
        "compatible with keys already registered."
    );
  }
  return hmac(key, data);
}

/**
 * Big-endian byte encoding of a non-negative integer, from RFC 8017.
 *
 * Fixed width on purpose. Trimming leading zeros would let two different
 * contexts serialize to the same bytes.
 */
function i2osp(value: bigint, length: number): Uint8Array {
  if (value < 0n) {
    throw new Error(`[starkzap] Cannot encode a negative value: ${value}`);
  }
  if (value >> BigInt(8 * length) !== 0n) {
    throw new Error(
      `[starkzap] Value does not fit in ${length} bytes: 0x${value.toString(16)}`
    );
  }

  const out = new Uint8Array(length);
  let rest = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** The 116-byte serialized derivation context. */
function serializeContext(context: ViewingKeyContext): Uint8Array {
  const bytes = encode.concatenateArrayBuffer([
    i2osp(CONTEXT_VERSION, 4),
    i2osp(BigInt(context.chainId), 32),
    i2osp(BigInt(context.accountAddress), 32),
    i2osp(BigInt(context.poolAddress), 32),
    i2osp(BigInt(context.keyIndex ?? 0), 16),
  ]);

  // A context of the wrong width still hashes, to a key nothing can read.
  if (bytes.length !== CONTEXT_BYTES) {
    throw new Error(
      `[starkzap] Serialized derivation context is ${bytes.length} bytes, ` +
        `expected ${CONTEXT_BYTES}.`
    );
  }
  return bytes;
}

/**
 * Derive a STRK20 viewing key from an account private key, per SNIP-44.
 *
 * The profile is `account-leaf-v1`: HMAC-SHA256 keyed with the account's
 * private scalar, over a fixed domain separator and the serialized context. No
 * signature is produced.
 *
 * The result is deterministic. The same key and context give the same viewing
 * key on every device, forever. The pool stores the key on first registration
 * and never lets it change.
 *
 * Stark-curve keys only. A secp256k1 key is out of range and is refused.
 * Supporting one needs a second profile, not a wider range.
 *
 * Nothing that feeds the HMAC may change: separator, context version, context
 * widths, modulus, fold. A change would orphan every registered key.
 *
 * @param privateKey - The account's private scalar, hex or bigint
 * @param context - Chain, account, pool and key slot to bind the key to
 * @returns The viewing key as a 0x-hex string, in `[1, n/2)`
 * @throws If the private key is not a scalar in `[1, n)`
 *
 * @see {@link https://github.com/starknet-io/SNIPs/pull/177|SNIP-44}
 */
export function deriveAccountLeafViewingKey(
  privateKey: string | bigint,
  context: ViewingKeyContext
): string {
  // Unreadable and out of range share one error. Both mean there is no scalar
  // to derive from.
  let scalar: bigint | undefined;
  try {
    scalar = BigInt(privateKey);
  } catch {
    scalar = undefined;
  }
  if (scalar === undefined || scalar < 1n || scalar >= ORDER) {
    throw new Error(
      "[starkzap] The account private key is not a scalar in the Stark curve's " +
        "range [1, n), so no viewing key can be derived from it."
    );
  }

  const key = i2osp(scalar, 32);
  const contextBytes = serializeContext(context);
  const domain = encode.utf8ToUint8Array(DOMAIN_SEPARATOR);

  // The counter advances only for rejected digests: at or above `LIMIT`, or
  // reducing to zero. About one digest in 32 is rejected. SNIP-44's
  // `rejection-sampling` test vector covers the retry.
  for (let counter = 0n; counter < 2n ** 32n; counter++) {
    const digest = hmacSha256(
      key,
      encode.concatenateArrayBuffer([domain, contextBytes, i2osp(counter, 4)])
    );

    const candidate = encode.uint8ArrayToBigInt(digest);
    if (candidate >= LIMIT) continue;

    const x = candidate % ORDER;
    if (x === 0n) continue;

    // Negating an upper-half scalar keeps the public key's x coordinate, so
    // both halves map to one canonical value.
    const folded = x < ORDER - x ? x : ORDER - x;
    if (folded >= 1n && folded < HALF_ORDER) {
      return num.toHex(folded);
    }
  }

  throw new Error(
    "[starkzap] SNIP-44 viewing-key derivation exhausted its counter, which is " +
      "not reachable for a valid key and context."
  );
}
