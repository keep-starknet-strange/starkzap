import { ec, hash, num } from "starknet";
import type { SignerInterface } from "@/signer";

/** Stark curve order. */
const ORDER = ec.starkCurve.CURVE.n;

/**
 * Upper bound of the range the pool accepts, `floor(n / 2)`.
 *
 * The bound is exclusive: the pool's `is_canonical_key` requires `1 <= k < H`.
 */
const HALF_ORDER = ORDER / 2n;

/** Bumped if {@link signatureDerivation} ever changes shape. */
const SIGNATURE_DERIVATION_VERSION = 1n;

/**
 * Which account, chain and pool a viewing key belongs to.
 *
 * Every field is folded into the derivation, so two pools, two chains or two
 * accounts never share a key. Felts are normalised before use, so `0x040...`
 * and `0x40...` are the same pool.
 */
export interface ViewingKeyContext {
  /** Chain id as a felt hex string, e.g. `0x534e5f4d41494e` for `SN_MAIN`. */
  chainId: string;
  /** Account whose private state the key unlocks. */
  accountAddress: string;
  /** Privacy pool contract address. */
  poolAddress: string;
  /**
   * Key slot, for pools that support rotation. Must be `0` for the current
   * pool generation, whose registered key is immutable.
   */
  keyIndex?: number;
}

/**
 * How a viewing key is produced for an account.
 *
 * Supply one to {@link PrivacyConfig.viewingKeyDerivation} to replace
 * starkzap's default. An implementation must be **deterministic**: the same
 * context and signer must yield the same key forever, on every device. The
 * pool stores the key's public x-coordinate on first registration and treats
 * it as authoritative, so a derivation that changes its output leaves every
 * existing note encrypted to a key nobody holds.
 *
 * It must also return a key in the pool's canonical range, `[1, n/2)`;
 * {@link assertCanonicalViewingKey} is applied to whatever it returns.
 *
 * @param context - Chain, account, pool and key slot to bind the key to
 * @param signer - The account's signer, for derivations that sign or that
 *   expose a purpose-bound KDF
 * @returns The viewing key as a 0x-hex string
 */
export type ViewingKeyDerivation = (
  context: ViewingKeyContext,
  signer: SignerInterface
) => Promise<string>;

/**
 * Reject a viewing key the pool would not accept.
 *
 * @param key - Candidate key, as hex or a bigint
 * @returns The key as a bigint
 * @throws If the key is outside `[1, n/2)`
 */
export function assertCanonicalViewingKey(key: string | bigint): bigint {
  const value = BigInt(key);
  if (value < 1n || value >= HALF_ORDER) {
    const problem =
      value < 1n
        ? "not positive"
        : `${value.toString(2).length} bits, so at or above n/2`;
    throw new Error(
      `[starkzap] The derived viewing key is ${problem}, outside the range the ` +
        "privacy pool accepts (1 <= key < n/2). A custom " +
        "`viewingKeyDerivation` must fold its output into that range."
    );
  }
  return value;
}

/**
 * Reject a signer whose signatures {@link signatureDerivation} cannot rely on.
 *
 * Exported so callers can check the precondition before doing other work —
 * {@link createPrivacy} does, to fail at construction rather than on the first
 * private operation.
 *
 * @param signer - Signer to check
 * @throws If the signer does not declare `deterministic: true`
 */
export function assertDeterministicSigner(signer: SignerInterface): void {
  if (signer.deterministic !== true) {
    throw new Error(
      "[starkzap] The default viewing-key derivation requires a signer that " +
        "declares `deterministic: true`. It folds an ECDSA signature into the " +
        "key, so a signer that draws a fresh nonce per signature would derive a " +
        "different key every call and lose access to previously encrypted " +
        "notes. StarkSigner declares it; Privy and Cartridge signers do not, " +
        "because their nonce policy is not ours to verify. Pass a custom " +
        "`viewingKeyDerivation` to support one of those."
    );
  }
}

/**
 * starkzap's default derivation: sign a canonical message, fold the signature.
 *
 * The message is `Poseidon(version, chainId, account, pool, keyIndex)`, signed
 * with the account's own signing key. Folding `(r, s)` through Poseidon and
 * reducing into `[1, n/2)` gives a key that is reproducible from the signing
 * key alone, so notes survive a wallet reinstall with nothing to back up.
 *
 * Needs only {@link SignerInterface.signRaw}, which every signer has. That is
 * the trade: it works with remote signers (where the private key is not ours
 * to read), at the cost of depending on the signer using a deterministic ECDSA
 * nonce (RFC-6979). Signers that do not declare `deterministic: true` are
 * refused rather than silently deriving a different key per call.
 *
 * @see {@link https://github.com/starknet-io/SNIPs/pull/177|SNIP-44}, which
 *   specifies an alternative that keys an HMAC with the raw
 *   account private key. It removes the determinism dependency but excludes
 *   every signer that will not hand over its private scalar. Still a Draft.
 */
export const signatureDerivation: ViewingKeyDerivation = async (
  context,
  signer
) => {
  assertDeterministicSigner(signer);

  const message = hash.computePoseidonHashOnElements([
    SIGNATURE_DERIVATION_VERSION,
    BigInt(context.chainId),
    BigInt(context.accountAddress),
    BigInt(context.poolAddress),
    BigInt(context.keyIndex ?? 0),
  ]);

  const signature = await signer.signRaw(num.toHex(message));
  const [r, s] = Array.isArray(signature)
    ? signature
    : [signature.r, signature.s];

  // Reduce into the pool's canonical range. Negating an upper-half value folds
  // it down while preserving the public key's x coordinate, so both halves map
  // to one canonical representative. The counter only advances for the ~2^-250
  // of inputs that reduce to 0, to exactly n/2, or to n/2 + 1 — all of which
  // fall outside the range and would otherwise need a special case.
  for (let counter = 0n; ; counter++) {
    const mixed = hash.computePoseidonHashOnElements([
      BigInt(r ?? 0),
      BigInt(s ?? 0),
      counter,
    ]);
    const reduced = BigInt(mixed) % ORDER;
    const folded = reduced > HALF_ORDER ? ORDER - reduced : reduced;
    if (folded >= 1n && folded < HALF_ORDER) {
      return num.toHex(folded);
    }
  }
};
