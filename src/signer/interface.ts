import type { Signature } from "starknet";
import type {
  SignableTransaction,
  SignedTransaction,
} from "../transaction/interface.js";

/**
 * Signer interface for the SDK.
 * Implement this to create custom signers (hardware wallets, MPC, Privy, etc.)
 *
 * Only requires implementing two methods:
 * - `getPubKey()` - returns the public key
 * - `signRaw(hash)` - signs a message hash and returns the signature
 *
 * The `sign(transaction)` method is provided as a convenience that calls `signRaw`.
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
   * Sign a transaction.
   * Gets the hash from the transaction and signs it.
   *
   * @param transaction - The transaction to sign
   * @returns The signed transaction
   */
  sign(transaction: SignableTransaction): Promise<SignedTransaction>;
}
