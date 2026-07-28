import type { Signature } from "starknet";

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
   * Whether {@link signRaw} returns the same signature every time for the same
   * hash — i.e. ECDSA with a deterministic nonce (RFC-6979) rather than a
   * random one.
   *
   * Only set this to `true` if you know it holds. Features that derive a secret
   * from a signature depend on it: the privacy pool's viewing key is a fold of
   * `(r, s)`, so a signer that draws a fresh nonce per call yields a different
   * key every time. The pool would still hold the *first* key, notes stay
   * encrypted to it, and the balance reads as empty with no way to recover.
   * So those features refuse a signer that does not claim determinism.
   *
   * Left undefined for signers that delegate to a backend whose nonce policy
   * starkzap cannot inspect.
   */
  readonly deterministic?: boolean;
}
