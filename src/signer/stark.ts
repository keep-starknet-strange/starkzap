import { ec, type Signature } from "starknet";
import { BaseSigner } from "./base.js";

/**
 * Standard Stark curve signer using a private key.
 *
 * @example
 * ```ts
 * const signer = new StarkSigner("0xPRIVATE_KEY");
 * ```
 */
export class StarkSigner extends BaseSigner {
  private readonly publicKey: string;
  private readonly privateKey: string;

  constructor(privateKey: string) {
    super();
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
}
