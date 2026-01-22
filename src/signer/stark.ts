import {
  Signer,
  ec,
  type Call,
  type InvocationsSignerDetails,
  type Signature,
  type SignerInterface as StarknetSignerInterface,
  type TypedData,
} from "starknet";
import type { SignerInterface } from "./interface.js";

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
  private readonly signer: Signer;

  constructor(privateKey: string) {
    this.publicKey = ec.starkCurve.getStarkKey(privateKey);
    this.signer = new Signer(privateKey);
  }

  async getPubKey(): Promise<string> {
    return this.publicKey;
  }

  async signMessage(
    typedData: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    return this.signer.signMessage(typedData, accountAddress);
  }

  async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    return this.signer.signTransaction(transactions, transactionsDetail);
  }

  /** @internal */
  _getStarknetSigner(): StarknetSignerInterface {
    return this.signer;
  }
}
