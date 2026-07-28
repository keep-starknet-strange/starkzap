import { ec, hash, num, type Calldata } from "starknet";
import type { PAYMASTER_API } from "@starknet-io/starknet-types-0103";
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

/** Privacy pool a viewing key is derived for. */
export interface ViewingKeyScope {
  /** Chain id as a felt hex string, e.g. `0x534e5f4d41494e` for `SN_MAIN`. */
  chainId: string;
  /** Privacy pool contract address, exactly as the pool is published. */
  poolAddress: string;
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
    const salt = this.getSalt(publicKey);

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

  /**
   * Derive the privacy-pool viewing key for this account.
   *
   * The viewing key is the secret that encrypts and decrypts private notes.
   * It is derived on demand rather than stored: signing a canonical message
   * with the account's signing key and folding the resulting `(r, s)` pair
   * through Poseidon reproduces the same key on every device, so notes stay
   * discoverable after a wallet reinstall.
   *
   * The signed message is `` `${chainId}:${poolAddress}` ``. The canonical
   * form used by the reference privacy wallet, so a key derived here matches
   * one derived elsewhere from the same signing key. Binding it to chain and
   * pool keeps mainnet and sepolia keys distinct and stops a pool
   * redeployment from inheriting the previous key.
   *
   * Both fields are interpolated verbatim: `0x040...` and `0x40...` are
   * different messages and derive different keys, which makes already
   * encrypted notes undiscoverable. Pass the exact strings the pool is
   * published under.
   *
   * @remarks
   * The signer's ECDSA must be deterministic (RFC-6979), as {@link StarkSigner}
   * is. A signer that draws a fresh nonce per signature yields a different key
   * on every call and permanently loses access to existing notes.
   *
   * @param scope - The chain and privacy pool the key is scoped to
   * @returns The viewing key as a 0x-hex string, reduced into the canonical
   *   range `[1, n/2]` that the pool contract accepts
   */
  async getViewingKey(scope: ViewingKeyScope): Promise<string> {
    const msgHash = num.toHex(
      hash.starknetKeccak(`${scope.chainId}:${scope.poolAddress}`)
    );

    const signature = await this.signer.signRaw(msgHash);
    const sigArray = Array.isArray(signature)
      ? signature
      : [signature.r, signature.s];

    // The pool only accepts keys in [1, n/2] (is_canonical_key). Poseidon
    // outputs over [0, p) with p > n, so reduce mod n, then negate an
    // upper-half value that folds it down while preserving the public
    // key's x coordinate.
    const order = ec.starkCurve.CURVE.n;
    const reduced =
      BigInt(hash.computePoseidonHashOnElements(sigArray)) % order;
    const canonical = reduced < order / 2n ? reduced : order - reduced;

    return num.toHex(canonical === 0n ? 1n : canonical);
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
