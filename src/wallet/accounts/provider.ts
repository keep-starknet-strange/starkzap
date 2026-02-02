import { hash, num, type Calldata } from "starknet";
import type { PAYMASTER_API } from "@starknet-io/starknet-types-010";
import { OpenZeppelinPreset } from "@/account";
import type { SignerInterface } from "@/signer";
import { type Address, fromAddress } from "@/types";
import type { AccountClassConfig } from "@/types";

/** Ensure value is a 0x-prefixed hex string */
function toHex(value: string | number | bigint): string {
  if (typeof value === "string" && value.startsWith("0x")) {
    return value;
  }
  return num.toHex(value);
}

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

    // Use custom salt computation if provided, otherwise use public key directly
    const salt = this.accountClass.getSalt
      ? this.accountClass.getSalt(publicKey)
      : publicKey;

    const addressStr = hash.calculateContractAddressFromHash(
      salt,
      this.accountClass.classHash,
      calldata,
      0 // deployer address (0 for counterfactual)
    );

    this.cachedAddress = fromAddress(addressStr);

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

  getSalt(publicKey: string): string {
    return this.accountClass.getSalt
      ? this.accountClass.getSalt(publicKey)
      : publicKey;
  }

  /**
   * Get deployment data for paymaster-sponsored deployment.
   */
  async getDeploymentData(): Promise<PAYMASTER_API.ACCOUNT_DEPLOYMENT_DATA> {
    const publicKey = await this.getPublicKey();
    const address = await this.getAddress();
    const calldata = this.getConstructorCalldata(publicKey);
    const salt = this.getSalt(publicKey);

    return {
      address: toHex(address.toString()),
      class_hash: toHex(this.accountClass.classHash),
      salt: toHex(salt),
      calldata: calldata.map((v) => toHex(v)),
      version: 1,
    };
  }
}
