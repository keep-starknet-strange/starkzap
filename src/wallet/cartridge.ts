import Controller, { toSessionPolicies } from "@cartridge/controller";
import {
  RpcProvider,
  type Account,
  type Call,
  type PaymasterTimeBounds,
  type EstimateFeeResponseOverhead,
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
  private readonly walletAccount: CartridgeWalletAccount;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly classHash: string;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;
  private deployedCache: boolean | null = null;

  private constructor(
    controller: Controller,
    walletAccount: CartridgeWalletAccount,
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

    if (!isCartridgeWalletAccount(walletAccount)) {
      throw new Error(
        "Cartridge connection failed. Make sure popups are allowed and try again."
      );
    }

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
    if (this.deployedCache === true) {
      return true;
    }
    const deployed = await checkDeployed(this.provider, this.address);
    if (deployed) {
      this.deployedCache = true;
    }
    return deployed;
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    return ensureWalletReady(this, options);
  }

  async deploy(_options: DeployOptions = {}): Promise<Tx> {
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
    await this.controller.disconnect();
  }

  /**
   * Get the Cartridge username for this wallet.
   */
  async username(): Promise<string | undefined> {
    return this.controller.username();
  }
}

interface CartridgeWalletAccount {
  address: string;
  execute: (calls: Call[]) => Promise<{
    transaction_hash: string;
  }>;
  executePaymasterTransaction: (
    calls: Call[],
    details: ReturnType<typeof sponsoredDetails>
  ) => Promise<{
    transaction_hash: string;
  }>;
  signMessage: (typedData: TypedData) => Promise<Signature>;
  simulateTransaction: (
    invocations: Array<{ type: "INVOKE"; payload: Call[] }>
  ) => Promise<unknown[]>;
  estimateInvokeFee: (calls: Call[]) => Promise<EstimateFeeResponseOverhead>;
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

function isCartridgeWalletAccount(
  value: unknown
): value is CartridgeWalletAccount {
  if (!value || typeof value !== "object") {
    return false;
  }

  const account = value as Partial<CartridgeWalletAccount>;
  return (
    typeof account.address === "string" &&
    typeof account.execute === "function" &&
    typeof account.executePaymasterTransaction === "function" &&
    typeof account.signMessage === "function" &&
    typeof account.simulateTransaction === "function" &&
    typeof account.estimateInvokeFee === "function"
  );
}
