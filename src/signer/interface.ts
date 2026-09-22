import type { Signature } from "starknet";

/**
 * Which account, chain and pool a viewing key belongs to.
 *
 * Every field is part of the derivation, so two pools, two chains or two
 * accounts never share a key. Felts are normalised, so `0x040...` and
 * `0x40...` are the same pool.
 *
 * Declared here because {@link SignerInterface.deriveViewingKey} takes it.
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
   * Optional, but the privacy pool needs it. The key is a KDF over the
   * account's private key, as defined by
   * {@link https://github.com/starknet-io/SNIPs/pull/177|SNIP-44}
   * `account-leaf-v1`. Use the exported `deriveAccountLeafViewingKey` to
   * implement it.
   *
   * Implementations must be deterministic. The same context must give the same
   * key on every device, forever. The private key must stay inside the signer.
   *
   * Leave it undefined for a signer that cannot run a KDF, such as a remote
   * signer. Privacy features then refuse that signer with a clear error. To use
   * it anyway, pass your own `viewingKeyDerivation`.
   *
   * @param context - Chain, account, pool and key slot to bind the key to
   * @returns The viewing key as a 0x-hex string, in the pool's canonical range
   */
  deriveViewingKey?(context: ViewingKeyContext): Promise<string>;
}
