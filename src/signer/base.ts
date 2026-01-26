import type { Signature } from "starknet";
import type { SignerInterface } from "./interface.js";
import type {
  SignableTransaction,
  SignedTransaction,
} from "../transaction/interface.js";

/**
 * Base signer class that provides default implementation for `sign()`.
 *
 * Extend this class and implement `getPubKey()` and `signRaw()` to create
 * a custom signer.
 */
export abstract class BaseSigner implements SignerInterface {
  /**
   * Get the public key.
   */
  abstract getPubKey(): Promise<string>;

  /**
   * Sign a raw message hash.
   */
  abstract signRaw(hash: string): Promise<Signature>;

  /**
   * Sign a transaction.
   * Gets the hash from the transaction and signs it using `signRaw`.
   */
  async sign(transaction: SignableTransaction): Promise<SignedTransaction> {
    const hash = transaction.getHashToSign();
    const signature = await this.signRaw(hash);
    return {
      transaction,
      signature,
    };
  }
}
