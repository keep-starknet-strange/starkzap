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
}
