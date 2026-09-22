import { ec, type Signature } from "starknet";
import type { SignerInterface, ViewingKeyContext } from "@/signer/interface";
import { deriveAccountLeafViewingKey } from "@/signer/snip44";

/**
 * Standard Stark curve signer using a private key.
 *
 * @example
 * ```ts
 * const signer = new StarkSigner("0xPRIVATE_KEY");
 * ```
 */
export class StarkSigner implements SignerInterface {
  private readonly publicKey: string;
  private readonly privateKey: string;

  constructor(privateKey: string) {
    this.privateKey = privateKey;
    this.publicKey = ec.starkCurve.getStarkKey(privateKey);
  }

  async getPubKey(): Promise<string> {
    return this.publicKey;
  }

  async signRaw(hash: string): Promise<Signature> {
    const signature = ec.starkCurve.sign(hash, this.privateKey);
    return ["0x" + signature.r.toString(16), "0x" + signature.s.toString(16)];
  }

  /**
   * SNIP-44 `account-leaf-v1`, run against the key this signer holds.
   *
   * No signature is produced: the key is an HMAC over the private scalar, so
   * there is no artefact that could be requested and turned back into the
   * viewing key.
   */
  async deriveViewingKey(context: ViewingKeyContext): Promise<string> {
    return deriveAccountLeafViewingKey(this.privateKey, context);
  }
}
