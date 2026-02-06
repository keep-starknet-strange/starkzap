import type { Signature } from "starknet";
import type { SignerInterface } from "@/signer/interface";

/**
 * Configuration for the Privy signer.
 *
 * You can either provide:
 * - `serverUrl`: URL to your backend's sign endpoint (simpler)
 * - `rawSign`: Custom signing function (flexible)
 */
export interface PrivySignerConfig {
  /** Privy wallet ID */
  walletId: string;
  /** Public key returned by Privy when creating the wallet */
  publicKey: string;
  /**
   * URL to your backend's sign endpoint.
   * The signer will POST { walletId, hash } and expect { signature } back.
   * @example "https://my-server.com/api/wallet/sign"
   */
  serverUrl?: string;
  /**
   * Custom function to call Privy's rawSign.
   * Use this for server-side signing with PrivyClient directly.
   */
  rawSign?: (walletId: string, messageHash: string) => Promise<string>;
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
 * // Option 1: Simple - provide your backend URL (recommended for mobile/web)
 * const signer = new PrivySigner({
 *   walletId: wallet.id,
 *   publicKey: wallet.public_key,
 *   serverUrl: "https://my-server.com/api/wallet/sign",
 * });
 *
 * // Option 2: Custom signing function (for server-side with PrivyClient)
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
 *   account: { signer, accountClass: ArgentPreset }
 * });
 * ```
 */
export class PrivySigner implements SignerInterface {
  private readonly walletId: string;
  private readonly publicKey: string;
  private readonly rawSignFn: (
    walletId: string,
    messageHash: string
  ) => Promise<string>;

  constructor(config: PrivySignerConfig) {
    if (!config.serverUrl && !config.rawSign) {
      throw new Error("PrivySigner requires either serverUrl or rawSign");
    }

    this.walletId = config.walletId;
    this.publicKey = config.publicKey;

    // Use provided rawSign or create one from serverUrl
    this.rawSignFn = config.rawSign ?? this.defaultRawSignFn(config.serverUrl!);
  }

  private defaultRawSignFn(serverUrl: string) {
    return async (walletId: string, hash: string): Promise<string> => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId, hash }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Privy signing failed");
      }

      const { signature } = await response.json();
      return signature;
    };
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
