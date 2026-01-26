import type { Signature } from "starknet";
import { BaseSigner } from "./base.js";

/**
 * Configuration for the Privy signer.
 */
export interface PrivySignerConfig {
  /** Privy wallet ID */
  walletId: string;
  /** Public key returned by Privy when creating the wallet */
  publicKey: string;
  /** Function to call Privy's rawSign endpoint */
  rawSign: (walletId: string, messageHash: string) => Promise<string>;
}

/**
 * Parse Privy signature (64-byte hex string) into [r, s] tuple.
 */
function parsePrivySignature(signature: string): Signature {
  const sigWithout0x = signature.startsWith("0x")
    ? signature.slice(2)
    : signature;

  // Privy returns 64-byte (128 hex char) signature: r (32 bytes) || s (32 bytes)
  const r = "0x" + sigWithout0x.slice(0, 64);
  const s = "0x" + sigWithout0x.slice(64);

  return [r, s];
}

/**
 * Privy-based signer for Starknet.
 *
 * This signer delegates signing to Privy's secure key management.
 * Privy holds the private key and you call their rawSign endpoint.
 *
 * @see https://docs.privy.io/recipes/use-tier-2#starknet
 *
 * @example
 * ```ts
 * import { PrivyClient } from '@privy-io/node';
 *
 * const privyClient = new PrivyClient({
 *   appId: process.env.PRIVY_APP_ID,
 *   appSecret: process.env.PRIVY_APP_SECRET
 * });
 *
 * // Create a Starknet wallet for a user
 * const wallet = await privyClient.wallets().create({
 *   chain_type: 'starknet'
 * });
 *
 * // Create the signer
 * const signer = new PrivySigner({
 *   walletId: wallet.id,
 *   publicKey: wallet.public_key,
 *   rawSign: async (walletId, messageHash) => {
 *     const response = await privyClient.wallets().rawSign(walletId, {
 *       params: { hash: messageHash }
 *     });
 *     return response.signature;
 *   }
 * });
 *
 * // Use with the SDK
 * const sdk = new StarkSDK({ rpcUrl: '...', chainId: 'SN_SEPOLIA' });
 * const wallet = await sdk.connectWallet({
 *   account: {
 *     signer,
 *     accountClass: ArgentXV050Preset,
 *   }
 * });
 * ```
 */
export class PrivySigner extends BaseSigner {
  private readonly walletId: string;
  private readonly publicKey: string;
  private readonly rawSignFn: (
    walletId: string,
    messageHash: string
  ) => Promise<string>;

  constructor(config: PrivySignerConfig) {
    super();
    this.walletId = config.walletId;
    this.publicKey = config.publicKey;
    this.rawSignFn = config.rawSign;
  }

  async getPubKey(): Promise<string> {
    return this.publicKey;
  }

  async signRaw(hash: string): Promise<Signature> {
    const hashWithPrefix = hash.startsWith("0x") ? hash : "0x" + hash;
    const signature = await this.rawSignFn(this.walletId, hashWithPrefix);
    return parsePrivySignature(signature);
  }
}
