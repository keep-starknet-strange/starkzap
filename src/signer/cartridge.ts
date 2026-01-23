import Controller from "@cartridge/controller";
import type { WalletAccount, Call, Signature, TypedData } from "starknet";
import type { SignerInterface } from "./interface.js";

/**
 * Options for configuring the Cartridge Controller.
 *
 * @example
 * ```ts
 * const signer = await CartridgeSigner.create({
 *   rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
 *   policies: [
 *     { target: "0x...", method: "transfer" }
 *   ]
 * });
 * ```
 */
export interface CartridgeSignerOptions {
  /** RPC URL for the Starknet network */
  rpcUrl?: string;
  /** Session policies for pre-approved transactions */
  policies?: Array<{ target: string; method: string }>;
  /** Preset name for controller configuration */
  preset?: string;
  /** Custom keychain URL */
  url?: string;
}

/**
 * Signer implementation using Cartridge Controller.
 *
 * Cartridge Controller provides a seamless onboarding experience with:
 * - Social login (Google, Discord)
 * - WebAuthn (passkeys)
 * - Session keys for gasless transactions
 *
 * @example
 * ```ts
 * import { CartridgeSigner } from "x";
 *
 * // Create and connect
 * const signer = await CartridgeSigner.create({
 *   rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
 *   policies: [
 *     { target: "0xCONTRACT", method: "transfer" }
 *   ]
 * });
 *
 * // Use with SDK
 * const wallet = await sdk.connectWallet({
 *   account: { signer }
 * });
 * ```
 */
export class CartridgeSigner implements SignerInterface {
  private readonly controller: Controller;
  private walletAccount: WalletAccount | undefined;

  private constructor(controller: Controller) {
    this.controller = controller;
  }

  /**
   * Create a CartridgeSigner and connect to Cartridge Controller.
   * This will open the Cartridge authentication popup if not already connected.
   *
   * @param options - Configuration options for Cartridge Controller
   * @returns A connected CartridgeSigner instance
   * @throws Error if connection fails or is cancelled
   */
  static async create(
    options: CartridgeSignerOptions = {}
  ): Promise<CartridgeSigner> {
    const controller = new Controller({
      rpcUrl: options.rpcUrl,
      policies: options.policies
        ? {
            contracts: Object.fromEntries(
              options.policies.map((p) => [
                p.target,
                { methods: [{ entrypoint: p.method }] },
              ])
            ),
          }
        : undefined,
      preset: options.preset,
      url: options.url,
    });

    const signer = new CartridgeSigner(controller);
    await signer.connect();
    return signer;
  }

  /**
   * Connect to Cartridge Controller.
   * Opens the authentication popup if not already connected.
   *
   * @returns The connected wallet account
   * @throws Error if connection fails or is cancelled
   */
  async connect(): Promise<WalletAccount> {
    // First try to probe for existing session
    const existing = await this.controller.probe();
    if (existing) {
      this.walletAccount = existing;
      return existing;
    }

    // Open connection popup
    const account = await this.controller.connect();
    if (!account) {
      throw new Error("Cartridge connection cancelled or failed");
    }

    this.walletAccount = account;
    return account;
  }

  /**
   * Check if the controller is connected.
   */
  isConnected(): boolean {
    return !!this.walletAccount;
  }

  /**
   * Get the connected wallet account.
   * @throws Error if not connected
   */
  getAccount(): WalletAccount {
    if (!this.walletAccount) {
      throw new Error("Cartridge not connected. Call connect() first.");
    }
    return this.walletAccount;
  }

  /**
   * Disconnect from Cartridge Controller.
   */
  async disconnect(): Promise<void> {
    await this.controller.disconnect();
    this.walletAccount = undefined;
  }

  /**
   * Get the public key from the connected account.
   */
  async getPubKey(): Promise<string> {
    const account = this.getAccount();
    // WalletAccount doesn't expose public key directly,
    // but we can use the address as identifier
    return account.address;
  }

  /**
   * Sign a typed data message using Cartridge Controller.
   */
  async signMessage(
    typedData: TypedData,
    _accountAddress: string
  ): Promise<Signature> {
    const account = this.getAccount();
    return account.signMessage(typedData);
  }

  /**
   * Sign a transaction using Cartridge Controller.
   * Note: Cartridge uses session keys, so this delegates to the controller.
   */
  async signTransaction(
    transactions: Call[],
    transactionsDetail: Parameters<SignerInterface["signTransaction"]>[1]
  ): Promise<Signature> {
    const account = this.getAccount();
    // WalletAccount uses the signer internally
    const signer = account.signer;
    return signer.signTransaction(transactions, transactionsDetail);
  }

  /**
   * @internal
   * Get the underlying starknet.js SignerInterface.
   */
  _getStarknetSigner() {
    return this.getAccount().signer;
  }

  /**
   * Get the Cartridge Controller instance.
   * Useful for accessing controller-specific features like:
   * - `controller.openProfile()`
   * - `controller.openSettings()`
   * - `controller.username()`
   */
  getController(): Controller {
    return this.controller;
  }
}
