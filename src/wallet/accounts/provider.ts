import { hash, type Calldata } from "starknet";
import { OpenZeppelinPreset } from "../../account/presets.js";
import type { SignerInterface } from "../../signer/index.js";
import { Address } from "../../types/address.js";
import type { AccountClassConfig } from "../../types/wallet.js";

/**
 * Account provider that combines a signer with an account class configuration.
 */
export class AccountProvider {
  private readonly signer: SignerInterface;
  private readonly accountClass: AccountClassConfig;
  private cachedPublicKey: string | null = null;
  private cachedAddress: Address | null = null;

  constructor(signer: SignerInterface, accountClass?: AccountClassConfig) {
    this.signer = signer;
    this.accountClass = accountClass ?? OpenZeppelinPreset;
  }

  async getAddress(): Promise<Address> {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    const publicKey = await this.getPublicKey();
    const calldata = this.getConstructorCalldata(publicKey);

    const addressStr = hash.calculateContractAddressFromHash(
      publicKey, // salt
      this.accountClass.classHash,
      calldata,
      0 // deployer address (0 for counterfactual)
    );

    this.cachedAddress = Address.from(addressStr);

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
