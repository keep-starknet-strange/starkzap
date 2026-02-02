import Controller from "@cartridge/controller";
import {
  RpcProvider,
  constants,
  type Account,
  type Call,
  type ExecutableUserTransaction,
  type PaymasterTimeBounds,
  type PreparedTransaction,
  type TypedData,
  type Signature,
  type WalletAccount,
} from "starknet";
import { Tx } from "../tx/index.js";
import type {
  EnsureReadyOptions,
  ExecuteOptions,
  FeeMode,
  PreflightOptions,
  PreflightResult,
  PrepareOptions,
} from "../types/wallet.js";
import type { ExplorerConfig, ChainId } from "../types/config.js";
import { Address } from "../types/address.js";
import type { WalletInterface } from "./interface.js";
import {
  checkDeployed,
  ensureWalletReady,
  executeWithFeeMode,
  preflightTransaction,
  buildSponsoredTransaction,
} from "./utils.js";

const CHAIN_ID_MAP: Record<ChainId, string> = {
  SN_MAIN: constants.StarknetChainId.SN_MAIN,
  SN_SEPOLIA: constants.StarknetChainId.SN_SEPOLIA,
};

/**
 * Options for connecting with Cartridge Controller.
 */
export interface CartridgeWalletOptions {
  rpcUrl?: string;
  chainId?: ChainId;
  policies?: Array<{ target: string; method: string }>;
  preset?: string;
  url?: string;
  feeMode?: FeeMode;
  timeBounds?: PaymasterTimeBounds;
  explorer?: ExplorerConfig;
}

/**
 * Wallet implementation using Cartridge Controller.
 *
 * Cartridge Controller provides a seamless onboarding experience with:
 * - Social login (Google, Discord)
 * - WebAuthn (passkeys)
 * - Session policies for gasless transactions
 *
 * @example
 * ```ts
 * const wallet = await CartridgeWallet.create({
 *   rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
 *   policies: [{ target: "0xCONTRACT", method: "transfer" }]
 * });
 *
 * await wallet.execute([...]);
 *
 * // Access Cartridge-specific features
 * const controller = wallet.getController();
 * controller.openProfile();
 * ```
 */
export class CartridgeWallet implements WalletInterface {
  readonly address: Address;
  private readonly controller: Controller;
  private readonly walletAccount: WalletAccount;
  private readonly provider: RpcProvider;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;

  private constructor(
    controller: Controller,
    walletAccount: WalletAccount,
    provider: RpcProvider,
    options: CartridgeWalletOptions = {}
  ) {
    this.address = Address.from(walletAccount.address);
    this.controller = controller;
    this.walletAccount = walletAccount;
    this.provider = provider;
    this.explorerConfig = options.explorer;
    this.defaultFeeMode = options.feeMode ?? "user_pays";
    this.defaultTimeBounds = options.timeBounds;
  }

  /**
   * Create and connect a CartridgeWallet.
   */
  static async create(
    options: CartridgeWalletOptions = {}
  ): Promise<CartridgeWallet> {
    const controllerOptions: Record<string, unknown> = {};

    if (options.chainId) {
      controllerOptions.defaultChainId = CHAIN_ID_MAP[options.chainId];
    }

    if (options.rpcUrl && !options.rpcUrl.includes("api.cartridge.gg")) {
      controllerOptions.chains = [{ rpcUrl: options.rpcUrl }];
    }

    if (options.policies && options.policies.length > 0) {
      controllerOptions.policies = {
        contracts: Object.fromEntries(
          options.policies.map((p) => [
            p.target,
            { methods: [{ entrypoint: p.method }] },
          ])
        ),
      };
    }

    if (options.preset) {
      controllerOptions.preset = options.preset;
    }

    if (options.url) {
      controllerOptions.url = options.url;
    }

    const controller = new Controller(controllerOptions);

    const maxWaitMs = 10000;
    const pollIntervalMs = 100;
    let waited = 0;

    while (!controller.isReady() && waited < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;
    }

    if (!controller.isReady()) {
      throw new Error(
        "Cartridge Controller failed to initialize. Please try again."
      );
    }

    const walletAccount = await controller.connect();

    if (!walletAccount) {
      throw new Error(
        "Cartridge connection failed. Make sure popups are allowed and try again."
      );
    }

    const provider = new RpcProvider({
      nodeUrl: options.rpcUrl ?? controller.rpcUrl(),
    });

    return new CartridgeWallet(controller, walletAccount, provider, options);
  }

  async isDeployed(): Promise<boolean> {
    return checkDeployed(this.provider, this.address);
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    return ensureWalletReady(this, options);
  }

  async deploy(): Promise<Tx> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.controller as any).keychain?.deploy();
    if (!result || result.code !== "SUCCESS") {
      throw new Error(result?.message ?? "Cartridge deployment failed");
    }
    return new Tx(result.transaction_hash, this.provider, this.explorerConfig);
  }

  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    return executeWithFeeMode(
      this.walletAccount,
      calls,
      feeMode,
      timeBounds,
      this.provider,
      this.explorerConfig
    );
  }

  async signMessage(typedData: TypedData): Promise<Signature> {
    return this.walletAccount.signMessage(typedData);
  }

  async buildSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<PreparedTransaction> {
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;
    return buildSponsoredTransaction(
      this.walletAccount,
      calls,
      timeBounds
    ) as Promise<PreparedTransaction>;
  }

  async signSponsored(
    prepared: PreparedTransaction
  ): Promise<ExecutableUserTransaction> {
    return this.walletAccount.preparePaymasterTransaction(prepared);
  }

  async prepareSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<ExecutableUserTransaction> {
    const prepared = await this.buildSponsored(calls, options);
    return this.signSponsored(prepared);
  }

  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    return preflightTransaction(this, this.walletAccount, options);
  }

  getAccount(): Account {
    return this.walletAccount as unknown as Account;
  }

  getProvider(): RpcProvider {
    return this.provider;
  }

  /**
   * Get the Cartridge Controller instance for Cartridge-specific features.
   */
  getController(): Controller {
    return this.controller;
  }

  async disconnect(): Promise<void> {
    await this.controller.disconnect();
  }

  /**
   * Get the Cartridge username for this wallet.
   */
  async username(): Promise<string | undefined> {
    return this.controller.username();
  }
}
