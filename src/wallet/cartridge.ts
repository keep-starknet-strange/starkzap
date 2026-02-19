import Controller, { toSessionPolicies } from "@cartridge/controller";
import {
  RpcProvider,
  type Account,
  type Call,
  type PaymasterTimeBounds,
  type TypedData,
  type Signature,
} from "starknet";
import { Tx } from "@/tx";
import {
  ChainId,
  getChainId,
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
import { assertSafeHttpUrl } from "@/utils";

const NEGATIVE_DEPLOYMENT_CACHE_TTL_MS = 3_000;
const MAX_CONTROLLER_WAIT_MS = 10_000;
const INITIAL_CONTROLLER_POLL_MS = 100;
const MAX_CONTROLLER_POLL_MS = 1_000;

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
  private readonly walletAccount: Account;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly classHash: string;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;
  private deployedCache: boolean | null = null;
  private deployedCacheExpiresAt = 0;

  private constructor(
    controller: Controller,
    walletAccount: Account,
    provider: RpcProvider,
    chainId: ChainId,
    classHash: string,
    stakingConfig: StakingConfig | undefined,
    options: CartridgeWalletOptions = {}
  ) {
    super(fromAddress(walletAccount.address), stakingConfig);
    this.controller = controller;
    this.walletAccount = walletAccount;
    this.provider = provider;
    this.classHash = classHash;
    this.chainId = chainId;
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
      const rpcUrl = assertSafeHttpUrl(
        options.rpcUrl,
        "Cartridge RPC URL"
      ).toString();
      controllerOptions.chains = [{ rpcUrl }];
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
      controllerOptions.url = assertSafeHttpUrl(
        options.url,
        "Cartridge controller URL"
      ).toString();
    }

    const controller = new Controller(controllerOptions);

    let waited = 0;
    let pollIntervalMs = INITIAL_CONTROLLER_POLL_MS;
    while (!controller.isReady() && waited < MAX_CONTROLLER_WAIT_MS) {
      const sleepMs = Math.min(
        pollIntervalMs,
        MAX_CONTROLLER_WAIT_MS - waited
      );
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
      waited += sleepMs;
      pollIntervalMs = Math.min(pollIntervalMs * 2, MAX_CONTROLLER_POLL_MS);
    }

    if (!controller.isReady()) {
      throw new Error(
        "Cartridge Controller failed to initialize. Please try again."
      );
    }

    const connectedAccount = await controller.connect();

    if (!isCartridgeWalletAccount(connectedAccount)) {
      throw new Error(
        "Cartridge connection failed. Make sure popups are allowed and try again."
      );
    }
    const walletAccount = connectedAccount as unknown as Account;

    const nodeUrl = assertSafeHttpUrl(
      options.rpcUrl ?? controller.rpcUrl(),
      "Cartridge RPC URL"
    ).toString();
    const provider = new RpcProvider({ nodeUrl });

    let classHash = "0x0";
    try {
      classHash = await provider.getClassHashAt(
        fromAddress(walletAccount.address)
      );
    } catch {
      // Keep "0x0" for undeployed accounts or unsupported providers.
    }
    const chainId = options.chainId ?? (await getChainId(provider));

    return new CartridgeWallet(
      controller,
      walletAccount,
      provider,
      chainId,
      classHash,
      stakingConfig,
      options
    );
  }

  async isDeployed(): Promise<boolean> {
    const now = Date.now();
    if (this.deployedCache === true) {
      return true;
    }
    if (this.deployedCache === false && now < this.deployedCacheExpiresAt) {
      return false;
    }

    const deployed = await checkDeployed(this.provider, this.address);
    if (deployed) {
      this.deployedCache = true;
      this.deployedCacheExpiresAt = Number.POSITIVE_INFINITY;
    } else {
      this.deployedCache = false;
      this.deployedCacheExpiresAt = now + NEGATIVE_DEPLOYMENT_CACHE_TTL_MS;
    }
    return deployed;
  }

  private clearDeploymentCache(): void {
    this.deployedCache = null;
    this.deployedCacheExpiresAt = 0;
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    return ensureWalletReady(this, options);
  }

  async deploy(options: DeployOptions = {}): Promise<Tx> {
    if (options.feeMode !== undefined || options.timeBounds !== undefined) {
      throw new Error(
        "CartridgeWallet.deploy() does not support DeployOptions overrides; deployment mode is controlled by Cartridge Controller."
      );
    }

    this.clearDeploymentCache();

    // Cartridge Controller handles deployment internally
    const result = await (
      this.controller as unknown as ControllerWithKeychain
    ).keychain?.deploy?.();
    if (!result || result.code !== "SUCCESS" || !result.transaction_hash) {
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

    let transaction_hash: string;

    if (feeMode === "sponsored") {
      // Allow provider/controller implementations to handle undeployed accounts
      // atomically via paymaster flow when supported.
      transaction_hash = (
        await this.walletAccount.executePaymasterTransaction(
          calls,
          sponsoredDetails(timeBounds)
        )
      ).transaction_hash;
    } else {
      const deployed = await this.isDeployed();
      if (!deployed) {
        throw new Error(
          'Account is not deployed. Call wallet.ensureReady({ deploy: "if_needed" }) before execute() in user_pays mode.'
        );
      }
      transaction_hash = (await this.walletAccount.execute(calls))
        .transaction_hash;
    }

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
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    return preflightTransaction(this, this.walletAccount, {
      ...options,
      feeMode,
    });
  }

  getAccount(): Account {
    return this.walletAccount;
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
    return this.classHash;
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
    this.clearCaches();
    this.clearDeploymentCache();
    await this.controller.disconnect();
  }

  /**
   * Get the Cartridge username for this wallet.
   */
  async username(): Promise<string | undefined> {
    return this.controller.username();
  }
}

type ControllerWithKeychain = {
  keychain?: {
    deploy?: () => Promise<{
      code?: string;
      message?: string;
      transaction_hash?: string;
    }>;
  };
};

type CartridgeAccountLike = {
  address: string;
  execute: (...args: unknown[]) => Promise<{ transaction_hash: string }>;
  executePaymasterTransaction: (
    ...args: unknown[]
  ) => Promise<{ transaction_hash: string }>;
  signMessage: (...args: unknown[]) => Promise<Signature>;
  simulateTransaction: (...args: unknown[]) => unknown;
  estimateInvokeFee: (...args: unknown[]) => unknown;
};

function isCartridgeWalletAccount(
  value: unknown
): value is CartridgeAccountLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const account = value as Partial<CartridgeAccountLike> & {
    address?: unknown;
  };
  return (
    typeof account.address === "string" &&
    typeof account.execute === "function" &&
    typeof account.executePaymasterTransaction === "function" &&
    typeof account.signMessage === "function" &&
    typeof account.simulateTransaction === "function" &&
    typeof account.estimateInvokeFee === "function"
  );
}
