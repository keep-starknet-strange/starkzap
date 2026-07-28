import { ec, type Signature } from "starknet";
import type { SignerInterface } from "@/signer/interface";

/**
 * Standard Stark curve signer using a private key.
 *
 * @example
 * ```ts
 * const signer = new StarkSigner("0xPRIVATE_KEY");
 * ```
 */
export class StarkSigner implements SignerInterface {
  /**
   * `ec.starkCurve.sign` uses RFC-6979, so the same hash always produces the
   * same signature. Signature-derived secrets are safe with this signer.
   */
  readonly deterministic = true;

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
}
