import { RpcProvider } from "starknet";
import type { SDKConfig } from "./types/config.js";
import type { ConnectWalletOptions } from "./types/wallet.js";
import { Wallet } from "./wallet/index.js";
import { AccountProvider } from "./wallet/accounts/provider.js";

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
   *   sponsorPolicyHint: { action: "onboarding" },
   * });
   * ```
   */
  async connectWallet(options: ConnectWalletOptions): Promise<Wallet> {
    const { account } = options;

    const accountProvider = new AccountProvider(
      account.signer,
      account.accountClass
    );

    return Wallet.create(accountProvider, this.provider, this.config);
  }

  /**
   * Get the underlying RPC provider.
   */
  getProvider(): RpcProvider {
    return this.provider;
  }
}
