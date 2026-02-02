import { RpcProvider } from "starknet";
import type { SDKConfig } from "./types/config.js";
import type { ConnectWalletOptions } from "./types/wallet.js";
import { Wallet } from "./wallet/index.js";
import {
  CartridgeWallet,
  type CartridgeWalletOptions,
} from "./wallet/cartridge.js";

/**
 * Main SDK class for Starknet wallet integration.
 *
 * @example
 * ```ts
 * import { StarkSDK, StarkSigner, ArgentPreset } from "x";
 *
 * const sdk = new StarkSDK({
 *   rpcUrl: "https://starknet-mainnet.infura.io/v3/...",
 *   chainId: "SN_MAIN",
 * });
 *
 * // Connect with default account (OpenZeppelin)
 * const wallet = await sdk.connectWallet({
 *   account: { signer: new StarkSigner(privateKey) },
 * });
 *
 * // Or with a different account preset
 * const wallet = await sdk.connectWallet({
 *   account: {
 *     signer: new StarkSigner(privateKey),
 *     accountClass: ArgentPreset,
 *   },
 * });
 *
 * // Use the wallet
 * await wallet.ensureReady({ deploy: "if_needed" });
 * const tx = await wallet.execute([...]);
 * await tx.wait();
 * ```
 */
export class StarkSDK {
  private readonly config: SDKConfig;
  private readonly provider: RpcProvider;

  constructor(config: SDKConfig) {
    this.config = config;
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  }

  /**
   * Connect a wallet using the specified signer and account configuration.
   *
   * @example
   * ```ts
   * import { StarkSigner, OpenZeppelinPreset, ArgentPreset } from "x";
   *
   * // Default: OpenZeppelin account
   * const wallet = await sdk.connectWallet({
   *   account: { signer: new StarkSigner(privateKey) },
   * });
   *
   * // With Argent preset
   * const wallet = await sdk.connectWallet({
   *   account: {
   *     signer: new StarkSigner(privateKey),
   *     accountClass: ArgentPreset,
   *   },
   * });
   *
   * // With custom account class
   * const wallet = await sdk.connectWallet({
   *   account: {
   *     signer: new StarkSigner(privateKey),
   *     accountClass: {
   *       classHash: "0x...",
   *       buildConstructorCalldata: (pk) => [pk, "0x0"],
   *     },
   *   },
   * });
   *
   * // With sponsored transactions
   * const wallet = await sdk.connectWallet({
   *   account: { signer: new StarkSigner(privateKey) },
   *   feeMode: "sponsored",
   * });
   * ```
   */
  async connectWallet(options: ConnectWalletOptions): Promise<Wallet> {
    const { account, feeMode, timeBounds } = options;

    return Wallet.create({
      account,
      provider: this.provider,
      config: this.config,
      ...(feeMode && { feeMode }),
      ...(timeBounds && { timeBounds }),
    });
  }

  /**
   * Connect using Cartridge Controller.
   *
   * Opens the Cartridge authentication popup for social login or passkeys.
   * Returns a CartridgeWallet that implements WalletInterface.
   *
   * @example
   * ```ts
   * const wallet = await sdk.connectCartridge({
   *   policies: [
   *     { target: "0xCONTRACT", method: "transfer" }
   *   ]
   * });
   *
   * // Use just like any other wallet
   * await wallet.execute([...]);
   *
   * // Access Cartridge-specific features
   * const controller = wallet.getController();
   * controller.openProfile();
   * ```
   */
  async connectCartridge(
    options: Omit<CartridgeWalletOptions, "rpcUrl" | "chainId"> = {}
  ): Promise<CartridgeWallet> {
    const explorer = options.explorer ?? this.config.explorer;
    return CartridgeWallet.create({
      ...options,
      rpcUrl: this.config.rpcUrl,
      chainId: this.config.chainId,
      ...(explorer && { explorer }),
    });
  }

  /**
   * Get the underlying RPC provider.
   */
  getProvider(): RpcProvider {
    return this.provider;
  }
}
