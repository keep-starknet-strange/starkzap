import { RpcProvider } from "starknet";
import type { SDKConfig, ChainId } from "@/types/config";
import type { ConnectWalletOptions } from "@/types/wallet";
import { networks, type NetworkPreset } from "@/network";
import { Wallet } from "@/wallet";
import {
  CartridgeWallet,
  type CartridgeWalletOptions,
} from "@/wallet/cartridge";
import type { Address, Token, Pool } from "@/types";
import type {
  AccountClassConfig,
  OnboardOptions,
  OnboardResult,
} from "@/types";
import { Staking } from "@/staking";
import { PrivySigner } from "@/signer";
import {
  ArgentXV050Preset,
  OpenZeppelinPreset,
  accountPresets,
  type AccountPresetName,
} from "@/account";

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
 *   chainId: ChainId.MAINNET,
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

  private resolveAccountPreset(
    preset: AccountPresetName | AccountClassConfig | undefined,
    fallback: AccountClassConfig
  ): AccountClassConfig {
    if (!preset) return fallback;

    if (typeof preset === "string") {
      const resolved = accountPresets[preset];
      if (!resolved) {
        throw new Error(`Unknown account preset: ${preset}`);
      }
      return resolved;
    }

    return preset;
  }

  /**
   * High-level onboarding API for app integrations.
   *
   * Strategy behaviors:
   * - `signer`: connect with a provided signer/account config
   * - `privy`: resolve Privy auth context, then connect via PrivySigner
   * - `cartridge`: connect via Cartridge Controller
   * - `webauthn`: reserved for upcoming native WebAuthn signer support
   *
   * By default, onboarding calls `wallet.ensureReady({ deploy: "if_needed" })`.
   */
  async onboard(options: OnboardOptions): Promise<OnboardResult> {
    const deploy = options.deploy ?? "if_needed";
    const feeMode = options.feeMode;
    const timeBounds = options.timeBounds;

    if (options.strategy === "signer") {
      const wallet = await this.connectWallet({
        account: {
          signer: options.account.signer,
          accountClass: this.resolveAccountPreset(
            options.accountPreset ?? options.account.accountClass,
            OpenZeppelinPreset
          ),
        },
        ...(feeMode && { feeMode }),
        ...(timeBounds && { timeBounds }),
      });

      await wallet.ensureReady({
        deploy,
        ...(feeMode && { feeMode }),
        ...(options.onProgress && { onProgress: options.onProgress }),
      });

      return {
        wallet,
        strategy: options.strategy,
        deployed: await wallet.isDeployed(),
      };
    }

    if (options.strategy === "privy") {
      const privy = await options.privy.resolve();
      const signer = new PrivySigner({
        walletId: privy.walletId,
        publicKey: privy.publicKey,
        ...(privy.serverUrl && { serverUrl: privy.serverUrl }),
        ...(privy.rawSign && { rawSign: privy.rawSign }),
      });

      const wallet = await this.connectWallet({
        account: {
          signer,
          accountClass: this.resolveAccountPreset(
            options.accountPreset,
            ArgentXV050Preset
          ),
        },
        ...(feeMode && { feeMode }),
        ...(timeBounds && { timeBounds }),
      });

      await wallet.ensureReady({
        deploy,
        ...(feeMode && { feeMode }),
        ...(options.onProgress && { onProgress: options.onProgress }),
      });

      return {
        wallet,
        strategy: options.strategy,
        deployed: await wallet.isDeployed(),
        ...(privy.metadata && { metadata: privy.metadata }),
      };
    }

    if (options.strategy === "cartridge") {
      const wallet = await this.connectCartridge({
        ...(options.cartridge ?? {}),
        ...(feeMode && { feeMode }),
        ...(timeBounds && { timeBounds }),
      });

      await wallet.ensureReady({
        deploy,
        ...(feeMode && { feeMode }),
        ...(options.onProgress && { onProgress: options.onProgress }),
      });

      return {
        wallet,
        strategy: options.strategy,
        deployed: await wallet.isDeployed(),
      };
    }

    if (options.strategy === "webauthn") {
      const err = new Error(
        "Onboard strategy 'webauthn' is not implemented yet. Use 'privy', 'signer', or 'cartridge' for now."
      ) as Error & { code?: string };
      err.code = "X_ERR_NOT_IMPLEMENTED";
      throw err;
    }

    const _never: never = options;
    throw new Error(`Unknown onboard strategy: ${String(_never)}`);
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
    return CartridgeWallet.create(
      {
        ...options,
        rpcUrl: this.config.rpcUrl,
        chainId: this.config.chainId,
        ...(explorer && { explorer }),
      },
      this.config.staking
    );
  }

  /**
   * Get all tokens that are currently enabled for staking.
   *
   * Returns the list of tokens that can be staked in the protocol.
   * Typically includes STRK and may include other tokens.
   *
   * @returns Array of tokens that can be staked
   * @throws Error if staking is not configured in the SDK config
   *
   * @example
   * ```ts
   * const tokens = await sdk.stakingTokens();
   * console.log(`Stakeable tokens: ${tokens.map(t => t.symbol).join(', ')}`);
   * // Output: "Stakeable tokens: STRK, BTC"
   * ```
   */
  async stakingTokens(): Promise<Token[]> {
    if (!this.config.staking?.contract) {
      throw new Error("`staking.contract` is not defined in the sdk config.");
    }

    return Staking.activeTokens(this.provider, this.config.staking);
  }

  /**
   * Get all delegation pools managed by a specific validator.
   *
   * Validators can have multiple pools, one for each supported token.
   * Use this to discover what pools a validator offers and their current
   * delegation amounts.
   *
   * @param staker - The validator's staker address
   * @returns Array of pools with their contract addresses, tokens, and amounts
   * @throws Error if staking is not configured in the SDK config
   *
   * @example
   * ```ts
   * const pools = await sdk.getStakerPools(validatorAddress);
   * for (const pool of pools) {
   *   console.log(`${pool.token.symbol}: ${pool.amount.toFormatted()} delegated`);
   * }
   * ```
   */
  async getStakerPools(staker: Address): Promise<Pool[]> {
    if (!this.config.staking?.contract) {
      throw new Error("`staking.contract` is not defined in the sdk config.");
    }

    return await Staking.getStakerPools(
      this.provider,
      staker,
      this.config.staking
    );
  }

  /**
   * Get the underlying RPC provider.
   */
  getProvider(): RpcProvider {
    return this.provider;
  }
}
