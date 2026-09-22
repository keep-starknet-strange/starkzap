import { ec } from "starknet";
import type { SignerInterface, ViewingKeyContext } from "@/signer";

export type { ViewingKeyContext };

/** Stark curve order. */
const ORDER = ec.starkCurve.CURVE.n;

/** Exclusive upper bound of the range the pool accepts: `1 <= k < n / 2`. */
const HALF_ORDER = ORDER / 2n;

/**
 * How a viewing key is produced for an account.
 *
 * Pass one to {@link PrivacyConfig.viewingKeyDerivation} to replace the
 * default. It must be deterministic. The same context and signer must give
 * the same key on every device, forever. The pool stores the first key and
 * never lets it change.
 *
 * The key must be in the range `[1, n/2)`. {@link assertCanonicalViewingKey}
 * checks the result.
 *
 * @param context - Chain, account, pool and key slot to bind the key to
 * @param signer - The account's signer
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
 * {@link createPrivacy} calls this, so a bad signer fails early.
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
 * The default derivation: SNIP-44 `account-leaf-v1`, run by the signer.
 *
 * The signer derives the key from its own key material. No signature is
 * produced. The result is deterministic, so the same account gives the same
 * key on every device.
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
  // Checked again, because this function is exported.
  assertViewingKeySigner(signer);
  // The line above is the null check.
  return signer.deriveViewingKey!(context);
};
