import Controller, { toSessionPolicies } from "@cartridge/controller";
import {
  RpcProvider,
  type Account,
  type Call,
  type PaymasterTimeBounds,
  type TypedData,
  type Signature,
  type WalletAccount,
} from "starknet";
import { Tx } from "@/tx";
import {
  ChainId,
  type DeployOptions,
  type EnsureReadyOptions,
  type ExecuteOptions,
  type FeeMode,
  type PreflightOptions,
  type PreflightResult,
  type ExplorerConfig,
  fromAddress,
  type StakingConfig,
} from "@/types";
import {
  checkDeployed,
  ensureWalletReady,
  preflightTransaction,
  sponsoredDetails,
} from "@/wallet/utils";
import { BaseWallet } from "@/wallet/base";

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
export class CartridgeWallet extends BaseWallet {
  private readonly controller: Controller;
  private readonly walletAccount: WalletAccount;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;

  private constructor(
    controller: Controller,
    walletAccount: WalletAccount,
    provider: RpcProvider,
    stakingConfig: StakingConfig | undefined,
    options: CartridgeWalletOptions = {}
  ) {
    super(fromAddress(walletAccount.address), stakingConfig);
    this.controller = controller;
    this.walletAccount = walletAccount;
    this.provider = provider;
    this.chainId = options.chainId ?? ChainId.MAINNET;
    this.explorerConfig = options.explorer;
    this.defaultFeeMode = options.feeMode ?? "user_pays";
    this.defaultTimeBounds = options.timeBounds;
  }

  /**
   * Create and connect a CartridgeWallet.
   */
  static async create(
    options: CartridgeWalletOptions = {},
    stakingConfig?: StakingConfig | undefined
  ): Promise<CartridgeWallet> {
    const controllerOptions: Record<string, unknown> = {};

    if (options.chainId) {
      controllerOptions.defaultChainId = options.chainId.toFelt252();
    }

    if (options.rpcUrl) {
      controllerOptions.chains = [{ rpcUrl: options.rpcUrl }];
    }

    if (options.policies && options.policies.length > 0) {
      // Normalize through Cartridge's own helper to avoid malformed policy payloads.
      controllerOptions.policies = toSessionPolicies(
        options.policies as Parameters<typeof toSessionPolicies>[0]
      );
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

    return new CartridgeWallet(
      controller,
      // @ts-expect-error This is a preexisting issue with the starknet.js version mismatch and cartridge's starknet.js version.
      walletAccount,
      provider,
      stakingConfig,
      options
    );
  }

  async isDeployed(): Promise<boolean> {
    return checkDeployed(this.provider, this.address);
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    return ensureWalletReady(this, options);
  }

  async deploy(_options: DeployOptions = {}): Promise<Tx> {
    // Cartridge Controller handles deployment internally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.controller as any).keychain?.deploy();
    if (!result || result.code !== "SUCCESS") {
      throw new Error(result?.message ?? "Cartridge deployment failed");
    }
    return new Tx(
      result.transaction_hash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    const { transaction_hash } =
      feeMode === "sponsored"
        ? await this.walletAccount.executePaymasterTransaction(
            calls,
            sponsoredDetails(timeBounds)
          )
        : await this.walletAccount.execute(calls);

    return new Tx(
      transaction_hash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  async signMessage(typedData: TypedData): Promise<Signature> {
    return this.walletAccount.signMessage(typedData);
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

  getChainId(): ChainId {
    return this.chainId;
  }

  getFeeMode(): FeeMode {
    return this.defaultFeeMode;
  }

  getClassHash(): string {
    // Cartridge Controller manages its own account class
    return "cartridge-controller";
  }

  async estimateFee(calls: Call[]) {
    return this.walletAccount.estimateInvokeFee(calls);
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
