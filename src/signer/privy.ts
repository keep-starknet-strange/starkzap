import type { Signature } from "starknet";
import type { SignerInterface } from "@/signer/interface";
import { assertSafeHttpUrl } from "@/utils";

type PrivySigningHeaders =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

type PrivySigningBody = (
  params: Readonly<{ walletId: string; hash: string }>
) => Record<string, unknown> | Promise<Record<string, unknown>>;

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
  /**
   * Optional headers (or header factory) for authenticated signing requests.
   *
   * Use this to pass session/JWT headers when calling your backend endpoint.
   */
  headers?: PrivySigningHeaders;
  /**
   * Optional payload builder for challenge/nonce aware signing endpoints.
   *
   * Default body is `{ walletId, hash }`.
   */
  buildBody?: PrivySigningBody;
  /**
   * Timeout for serverUrl requests in milliseconds.
   * @default 10000
   */
  requestTimeoutMs?: number;
}

/**
 * Parse Privy signature (64-byte hex string) into [r, s] tuple.
 */
function parsePrivySignature(signature: string): Signature {
  if (typeof signature !== "string" || signature.length === 0) {
    throw new Error("Privy signing failed: empty signature response");
  }

  const sigWithout0x = signature.startsWith("0x")
    ? signature.slice(2)
    : signature;

  if (!/^[0-9a-fA-F]+$/.test(sigWithout0x)) {
    throw new Error("Privy signing failed: signature is not valid hex");
  }

  if (sigWithout0x.length !== 128) {
    throw new Error(
      "Privy signing failed: expected a 64-byte signature (r||s)"
    );
  }

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
 * const sdk = new StarkSDK({ rpcUrl: '...', chainId: ChainId.SEPOLIA });
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
    this.rawSignFn =
      config.rawSign ??
      this.defaultRawSignFn(config.serverUrl!, {
        headers: config.headers,
        buildBody: config.buildBody,
        requestTimeoutMs: config.requestTimeoutMs,
      });
  }

  private async resolveHeaders(
    headers: PrivySigningHeaders | undefined
  ): Promise<Record<string, string>> {
    if (!headers) {
      return {};
    }
    return typeof headers === "function" ? await headers() : headers;
  }

  private defaultRawSignFn(
    serverUrl: string,
    options: {
      headers: PrivySigningHeaders | undefined;
      buildBody: PrivySigningBody | undefined;
      requestTimeoutMs: number | undefined;
    }
  ) {
    const normalizedUrl = assertSafeHttpUrl(
      serverUrl,
      "PrivySigner serverUrl"
    ).toString();
    const timeoutMs = options.requestTimeoutMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        "PrivySigner requestTimeoutMs must be a positive finite number"
      );
    }

    return async (walletId: string, hash: string): Promise<string> => {
      const extraHeaders = await this.resolveHeaders(options.headers);
      const payload = (await options.buildBody?.({ walletId, hash })) ?? {
        walletId,
        hash,
      };

      const controller =
        typeof AbortController !== "undefined"
          ? new AbortController()
          : undefined;
      const timeoutHandle =
        controller &&
        setTimeout(() => {
          controller.abort();
        }, timeoutMs);

      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        const requestInit: RequestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json", ...extraHeaders },
          body: JSON.stringify(payload),
        };
        if (controller) {
          requestInit.signal = controller.signal;
        }

        response = await fetch(normalizedUrl, requestInit);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(
            `Privy signing request timed out after ${timeoutMs}ms`
          );
        }
        throw error;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error("Privy signing failed: invalid JSON response");
      }

      if (!response.ok) {
        const err =
          typeof data === "object" && data !== null
            ? (data as Record<string, unknown>)
            : {};
        throw new Error(
          (typeof err.details === "string" && err.details) ||
            (typeof err.error === "string" && err.error) ||
            "Privy signing failed"
        );
      }

      const signature =
        typeof data === "object" && data !== null
          ? (data as Record<string, unknown>).signature
          : undefined;
      if (typeof signature !== "string") {
        throw new Error("Privy signing failed: invalid server response");
      }
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
