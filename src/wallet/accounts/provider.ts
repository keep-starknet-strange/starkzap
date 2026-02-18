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
 *
 * Computes and caches the Starknet address from the signer's public key
 * and the account class constructor. This is the bridge between a
 * {@link SignerInterface} and a deployed (or counterfactual) account contract.
 *
 * @example
 * ```ts
 * import { AccountProvider, StarkSigner, ArgentPreset } from "starkzap";
 *
 * const provider = new AccountProvider(
 *   new StarkSigner(privateKey),
 *   ArgentPreset
 * );
 *
 * const address = await provider.getAddress();
 * const publicKey = await provider.getPublicKey();
 * ```
 */
export class AccountProvider {
  private readonly signer: SignerInterface;
  private readonly accountClass: AccountClassConfig;
  private cachedPublicKey: string | null = null;
  private cachedAddress: Address | null = null;

  /**
   * @param signer - The signer implementation for signing operations
   * @param accountClass - Account class configuration (default: {@link OpenZeppelinPreset})
   */
  constructor(signer: SignerInterface, accountClass?: AccountClassConfig) {
    this.signer = signer;
    this.accountClass = accountClass ?? OpenZeppelinPreset;
  }

  /**
   * Compute and return the counterfactual address for this account.
   *
   * The address is derived from the signer's public key, the account class
   * hash, and the constructor calldata. Cached after first computation.
   *
   * @returns The Starknet address for this account
   */
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

  /**
   * Get the public key from the underlying signer. Cached after first call.
   * @returns The public key as a hex string
   */
  async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }
    const pubKey = await this.signer.getPubKey();
    this.cachedPublicKey = pubKey;
    return pubKey;
  }

  /** Get the underlying signer instance. */
  getSigner(): SignerInterface {
    return this.signer;
  }

  /** Get the account contract class hash. */
  getClassHash(): string {
    return this.accountClass.classHash;
  }

  /** Build the constructor calldata from the given public key. */
  getConstructorCalldata(publicKey: string): Calldata {
    return this.accountClass.buildConstructorCalldata(publicKey);
  }

  /** Compute the address salt from the given public key. */
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
