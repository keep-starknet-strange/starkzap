import { hash, type Calldata } from "starknet";
import type { SignerInterface } from "../../signer/interface.js";
import type { AccountClassConfig } from "../../types/wallet.js";
import { OpenZeppelinPreset } from "../../account/presets.js";

/**
 * Account provider that combines a signer with an account class configuration.
 */
export class AccountProvider {
  private readonly signer: SignerInterface;
  private readonly accountClass: AccountClassConfig;
  private cachedPublicKey: string | null = null;
  private cachedAddress: string | null = null;

  constructor(signer: SignerInterface, accountClass?: AccountClassConfig) {
    this.signer = signer;
    this.accountClass = accountClass ?? OpenZeppelinPreset;
  }

  async getAddress(): Promise<string> {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    const publicKey = await this.getPublicKey();
    const calldata = this.getConstructorCalldata(publicKey);

    this.cachedAddress = hash.calculateContractAddressFromHash(
      publicKey, // salt
      this.accountClass.classHash,
      calldata,
      0 // deployer address (0 for counterfactual)
    );

    return this.cachedAddress;
  }

  async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }
    const pubKey = await this.signer.getPubKey();
    this.cachedPublicKey = pubKey;
    return pubKey;
  }

  getSigner(): SignerInterface {
    return this.signer;
  }

  getClassHash(): string {
    return this.accountClass.classHash;
  }

  getConstructorCalldata(publicKey: string): Calldata {
    return this.accountClass.buildConstructorCalldata(publicKey);
  }
}
