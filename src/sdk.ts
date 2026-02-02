import { RpcProvider } from "starknet";
import type { SDKConfig, ChainId } from "@/types/config";
import type { ConnectWalletOptions } from "@/types/wallet";
import { networks, type NetworkPreset } from "@/network";
import { Wallet } from "@/wallet";
import {
  CartridgeWallet,
  type CartridgeWalletOptions,
} from "@/wallet/cartridge";
import { AccountProvider } from "@/wallet/accounts/provider";
import type { Address, Token } from "@/types";
import { Staking } from "@/staking";

/** Resolved SDK configuration with required rpcUrl and chainId */
interface ResolvedConfig extends Omit<SDKConfig, "rpcUrl" | "chainId"> {
  rpcUrl: string;
  chainId: ChainId;
}

/**
 * Main SDK class for Starknet wallet integration.
 *
 * @example
 * ```ts
 * import { StarkSDK, StarkSigner, ArgentPreset } from "x";
 *
 * // Using network presets (recommended)
 * const sdk = new StarkSDK({ network: "mainnet" });
 * const sdk = new StarkSDK({ network: "sepolia" });
 *
 * // Or with custom RPC
 * const sdk = new StarkSDK({
 *   rpcUrl: "https://my-rpc.example.com",
 *   chainId: "SN_MAIN",
 * });
 *
 * // Connect with default account (OpenZeppelin)
 * const wallet = await sdk.connectWallet({
 *   account: { signer: new StarkSigner(privateKey) },
 * });
 *
 * // Use the wallet
 * await wallet.ensureReady({ deploy: "if_needed" });
 * const tx = await wallet.execute([...]);
 * await tx.wait();
 * ```
 */
export class StarkSDK {
  private readonly config: ResolvedConfig;
  private readonly provider: RpcProvider;

  constructor(config: SDKConfig) {
    this.config = this.resolveConfig(config);
    this.provider = new RpcProvider({ nodeUrl: this.config.rpcUrl });
  }

  private resolveConfig(config: SDKConfig): ResolvedConfig {
    // Get network preset if specified
    let networkPreset: NetworkPreset | undefined;
    if (config.network) {
      networkPreset =
        typeof config.network === "string"
          ? networks[config.network]
          : config.network;
    }

    // Resolve rpcUrl (explicit > network preset)
    const rpcUrl = config.rpcUrl ?? networkPreset?.rpcUrl;
    if (!rpcUrl) {
      throw new Error(
        "StarkSDK requires either 'network' or 'rpcUrl' to be specified"
      );
    }

    // Resolve chainId (explicit > network preset)
    const chainId = config.chainId ?? networkPreset?.chainId;
    if (!chainId) {
      throw new Error(
        "StarkSDK requires either 'network' or 'chainId' to be specified"
      );
    }

    // Resolve explorer (explicit > network preset)
    const explorer =
      config.explorer ??
      (networkPreset?.explorerUrl
        ? { baseUrl: networkPreset.explorerUrl }
        : undefined);

    return {
      ...config,
      rpcUrl,
      chainId,
      ...(explorer && { explorer }),
    };
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

  async stakingInPool(pool: Address, stakeToken: Token): Promise<Staking> {
    if (!this.config.stakingContract) {
      throw new Error("`stakingContract` is not defined in the sdk config.");
    }

    return Staking.fromPool(
      pool,
      stakeToken,
      this.provider,
      this.config.stakingContract
    );
  }

  async stakingInValidator(
    staker: Address,
    stakeToken: Token
  ): Promise<Staking> {
    if (!this.config.stakingContract) {
      throw new Error("`stakingContract` is not defined in the sdk config.");
    }

    return Staking.fromStaker(
      staker,
      stakeToken,
      this.provider,
      this.config.stakingContract
    );
  }

  async stakingTokens(): Promise<Token[]> {
    if (!this.config.stakingContract) {
      throw new Error("`stakingContract` is not defined in the sdk config.");
    }

    return Staking.activeTokens(
      this.provider,
      this.config.chainId,
      this.config.stakingContract
    );
  }

  /**
   * Get the underlying RPC provider.
   */
  getProvider(): RpcProvider {
    return this.provider;
  }
}
