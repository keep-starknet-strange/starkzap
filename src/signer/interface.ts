import type { Signature } from "starknet";

/**
 * Which account, chain and pool a viewing key belongs to.
 *
 * Every field is folded into the derivation, so two pools, two chains or two
 * accounts never share a key. Felts are normalised before use, so `0x040...`
 * and `0x40...` are the same pool.
 *
 * Declared here rather than with the privacy code because
 * {@link SignerInterface.deriveViewingKey} takes it: a signer has to be able to
 * name this type to implement the method, and signers are written against the
 * root entry point.
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
 * Signer interface for the SDK.
 * Implement this to create custom signers (hardware wallets, MPC, Privy, etc.)
 *
 * Only requires implementing two methods:
 * - `getPubKey()` - returns the public key
 * - `signRaw(hash)` - signs a message hash and returns the signature
 *
 * The SDK uses `SignerAdapter` to bridge this interface with starknet.js internally.
 */
export interface SignerInterface {
  /**
   * Get the public key.
   */
  getPubKey(): Promise<string>;

  /**
   * Sign a raw message hash.
   * This is the core signing primitive - all transaction signing ultimately calls this.
   *
   * @param hash - The message hash to sign (hex string with 0x prefix)
   * @returns The signature as [r, s] tuple
   */
  signRaw(hash: string): Promise<Signature>;

  /**
   * Derive the STRK20 viewing key for this account, inside the signer.
   *
   * Optional, but required by the privacy pool: it is how the viewing key is
   * produced, and there is no fallback that only signs. The key comes from a
   * purpose-bound KDF over the account's own private scalar, so no signature is
   * produced and nothing exists that could be requested and turned back into the
   * key. See {@link https://github.com/starknet-io/SNIPs/pull/177|SNIP-44}, whose
   * `account-leaf-v1` profile this implements;
   * `deriveAccountLeafViewingKey` is exported so an implementation does not have
   * to reproduce it.
   *
   * Implementations **must** be deterministic — same context, same key, forever,
   * on every device — and must keep the account private key inside the signer.
   * They must not expose a general KDF oracle keyed by that key: the domain
   * separator and the input structure are fixed by the profile, not chosen by
   * the caller.
   *
   * Left undefined by signers that cannot run a KDF over their key material,
   * such as remote signers that only sign. Privacy features refuse those with a
   * clear error rather than deriving from a signature, which would disclose the
   * viewing key to anyone who obtained one. Such a signer can still be used by
   * passing a `viewingKeyDerivation` of your own.
   *
   * @param context - Chain, account, pool and key slot to bind the key to
   * @returns The viewing key as a 0x-hex string, in the pool's canonical range
   */
  deriveViewingKey?(context: ViewingKeyContext): Promise<string>;
}
