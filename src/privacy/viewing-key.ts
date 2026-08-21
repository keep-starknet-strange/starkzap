import { ec } from "starknet";
import type { SignerInterface, ViewingKeyContext } from "@/signer";

export type { ViewingKeyContext };

/** Stark curve order. */
const ORDER = ec.starkCurve.CURVE.n;

/**
 * Upper bound of the range the pool accepts, `floor(n / 2)`.
 *
 * The bound is exclusive: the pool's `is_canonical_key` requires `1 <= k < H`.
 */
const HALF_ORDER = ORDER / 2n;

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
 * @param signer - The account's signer, for derivations that read key material
 *   through it or that delegate to a device
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
 * Reject a signer the default derivation cannot use.
 *
 * Exported so callers can check the precondition before doing other work —
 * {@link createPrivacy} does, to fail at construction rather than on the first
 * private operation.
 *
 * @param signer - Signer to check
 * @throws If the signer does not implement
 *   {@link SignerInterface.deriveViewingKey}
 */
export function assertViewingKeySigner(signer: SignerInterface): void {
  if (typeof signer.deriveViewingKey !== "function") {
    throw new Error(
      "[starkzap] The default viewing-key derivation needs a signer that " +
        "implements `deriveViewingKey`, which derives the key from the account " +
        "key inside the signer (SNIP-44 `account-leaf-v1`). `StarkSigner` does; " +
        "signers that only sign, such as the Privy and Cartridge ones, cannot " +
        "run a KDF over their key material at all. Either implement the method " +
        "on your signer (`deriveAccountLeafViewingKey` is exported for that) or " +
        "pass your own `viewingKeyDerivation`."
    );
  }
}

/**
 * starkzap's default derivation: SNIP-44 `account-leaf-v1`, run by the signer.
 *
 * The signer derives the key from its own key material and returns it, so no
 * signature is produced and nothing exists that could be handed out and turned
 * back into the viewing key. Deterministic by construction — the profile is an
 * HMAC, a pure function of the account key and the context — so the same account
 * yields the same key on every device, forever, which is what the pool requires
 * of a key it registers once and never lets change.
 *
 * @param context - Chain, account, pool and key slot to bind the key to
 * @param signer - Must implement {@link SignerInterface.deriveViewingKey}
 * @returns The viewing key as a 0x-hex string
 * @throws If the signer does not implement `deriveViewingKey`
 *
 * @see {@link https://github.com/starknet-io/SNIPs/pull/177|SNIP-44} for the
 *   profile, and {@link deriveAccountLeafViewingKey} for the implementation a
 *   signer runs.
 */
export const accountLeafDerivation: ViewingKeyDerivation = async (
  context,
  signer
) => {
  // Checked again here, not just in `createPrivacy`: this is exported, so it can
  // be handed a signer that never went through that precondition.
  assertViewingKeySigner(signer);
  // Non-null asserted rather than re-tested — the line above is the test, and a
  // second `if` would read as though it could fail.
  return signer.deriveViewingKey!(context);
};
