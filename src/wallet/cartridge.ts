import Controller from "@cartridge/controller";
import {
  RpcProvider,
  TransactionFinalityStatus,
  type Account,
  type Call,
  type ExecutableUserTransaction,
  type PaymasterTimeBounds,
  type PreparedTransaction,
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
import type { ExplorerConfig } from "../types/config.js";
import type { WalletInterface } from "./interface.js";

/**
 * Options for connecting with Cartridge Controller.
 *
 * @example
 * ```ts
 * const wallet = await sdk.connectCartridge({
 *   rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
 *   policies: [
 *     { target: "0xCONTRACT", method: "transfer" }
 *   ]
 * });
 * ```
 */
export interface CartridgeWalletOptions {
  /** RPC URL for the Starknet network */
  rpcUrl?: string;
  /** Session policies for pre-approved transactions */
  policies?: Array<{ target: string; method: string }>;
  /** Preset name for controller configuration */
  preset?: string;
  /** Custom keychain URL */
  url?: string;
  /** Default fee mode for transactions */
  feeMode?: FeeMode;
  /** Default time bounds for sponsored transactions */
  timeBounds?: PaymasterTimeBounds;
  /** Explorer configuration for transaction URLs */
  explorer?: ExplorerConfig;
}

/**
 * Wallet implementation using Cartridge Controller.
 *
 * Cartridge Controller provides a seamless onboarding experience with:
 * - Social login (Google, Discord)
 * - WebAuthn (passkeys)
 * - Session keys for gasless transactions
 *
 * @example
 * ```ts
 * const wallet = await CartridgeWallet.create({
 *   rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
 *   policies: [
 *     { target: "0xCONTRACT", method: "transfer" }
 *   ]
 * });
 *
 * // Use just like any other wallet
 * await wallet.execute([
 *   { contractAddress: "0x...", entrypoint: "transfer", calldata: [...] }
 * ]);
 *
 * // Access Cartridge-specific features
 * const controller = wallet.getController();
 * controller.openProfile();
 * ```
 */
export class CartridgeWallet implements WalletInterface {
  readonly address: string;

  private readonly controller: Controller;
  private readonly walletAccount: WalletAccount;
  private readonly provider: RpcProvider;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;
  private readonly explorerConfig: ExplorerConfig | undefined;

  private constructor(
    controller: Controller,
    walletAccount: WalletAccount,
    provider: RpcProvider,
    options: CartridgeWalletOptions = {}
  ) {
    this.controller = controller;
    this.walletAccount = walletAccount;
    this.address = walletAccount.address;
    this.provider = provider;
    this.defaultFeeMode = options.feeMode ?? "user_pays";
    this.defaultTimeBounds = options.timeBounds;
    this.explorerConfig = options.explorer;
  }

  /**
   * Create and connect a CartridgeWallet.
   * Opens the Cartridge authentication popup if not already connected.
   *
   * @param options - Configuration options
   * @returns A connected CartridgeWallet instance
   * @throws Error if connection fails or is cancelled
   */
  static async create(
    options: CartridgeWalletOptions = {}
  ): Promise<CartridgeWallet> {
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

    // First try to probe for existing session
    let walletAccount = await controller.probe();

    if (!walletAccount) {
      // Open connection popup
      walletAccount = await controller.connect();
      if (!walletAccount) {
        throw new Error("Cartridge connection cancelled or failed");
      }
    }

    const provider = new RpcProvider({
      nodeUrl: options.rpcUrl ?? controller.rpcUrl(),
    });

    return new CartridgeWallet(controller, walletAccount, provider, options);
  }

  /**
   * Check if the account contract is deployed on-chain.
   * Cartridge accounts are typically already deployed.
   */
  async isDeployed(): Promise<boolean> {
    try {
      const classHash = await this.provider.getClassHashAt(this.address);
      return !!classHash;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the wallet is ready for transactions.
   * For Cartridge, this checks deployment and deploys if needed.
   */
  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    const { deploy = "if_needed", onProgress } = options;

    onProgress?.({ step: "CONNECTED" });

    onProgress?.({ step: "CHECK_DEPLOYED" });
    const deployed = await this.isDeployed();

    if (deployed && deploy !== "always") {
      onProgress?.({ step: "READY" });
      return;
    }

    if (!deployed && deploy === "never") {
      throw new Error("Account not deployed and deploy mode is 'never'");
    }

    onProgress?.({ step: "DEPLOYING" });
    const tx = await this.deploy();
    await tx.wait({
      successStates: [
        TransactionFinalityStatus.ACCEPTED_ON_L2,
        TransactionFinalityStatus.ACCEPTED_ON_L1,
      ],
    });

    onProgress?.({ step: "READY" });
  }

  /**
   * Deploy the account contract via Cartridge Controller.
   */
  async deploy(): Promise<Tx> {
    // Cartridge handles deployment through its keychain
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.controller as any).keychain?.deploy();
    if (!result || result.code !== "SUCCESS") {
      throw new Error(result?.message ?? "Cartridge deployment failed");
    }

    return new Tx(result.transaction_hash, this.provider, this.explorerConfig);
  }

  /**
   * Execute one or more contract calls.
   * Cartridge uses session keys for pre-approved transactions.
   */
  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    if (feeMode === "sponsored") {
      // Use paymaster for sponsored transactions
      const paymasterDetails = {
        feeMode: { mode: "sponsored" as const },
        ...(timeBounds && { timeBounds }),
      };

      const { transaction_hash } =
        await this.walletAccount.executePaymasterTransaction(
          calls,
          paymasterDetails
        );

      return new Tx(transaction_hash, this.provider, this.explorerConfig);
    }

    // Standard execution through Cartridge
    const { transaction_hash } = await this.walletAccount.execute(calls);

    return new Tx(transaction_hash, this.provider, this.explorerConfig);
  }

  /**
   * Build a sponsored transaction for the paymaster.
   */
  async buildSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<PreparedTransaction> {
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    const paymasterDetails = {
      feeMode: { mode: "sponsored" as const },
      ...(timeBounds && { timeBounds }),
    };

    return this.walletAccount.buildPaymasterTransaction(
      calls,
      paymasterDetails
    );
  }

  /**
   * Sign a prepared sponsored transaction.
   */
  async signSponsored(
    prepared: PreparedTransaction
  ): Promise<ExecutableUserTransaction> {
    return this.walletAccount.preparePaymasterTransaction(prepared);
  }

  /**
   * Build and sign a sponsored transaction in one step.
   */
  async prepareSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<ExecutableUserTransaction> {
    const prepared = await this.buildSponsored(calls, options);
    return this.signSponsored(prepared);
  }

  /**
   * Check if an operation can succeed before attempting it.
   */
  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    const { kind, calls = [] } = options;

    try {
      const deployed = await this.isDeployed();
      if (!deployed && kind !== "execute") {
        return { ok: false, reason: "Account not deployed" };
      }

      if (calls.length > 0) {
        const simulation = await this.walletAccount.simulateTransaction([
          { type: "INVOKE", payload: calls },
        ]);

        const result = simulation[0];
        if (
          result &&
          "transaction_trace" in result &&
          result.transaction_trace
        ) {
          const trace = result.transaction_trace;
          if (
            "execute_invocation" in trace &&
            trace.execute_invocation &&
            "revert_reason" in trace.execute_invocation
          ) {
            return {
              ok: false,
              reason:
                trace.execute_invocation.revert_reason ?? "Simulation failed",
            };
          }
        }
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get the underlying starknet.js Account instance.
   */
  getAccount(): Account {
    return this.walletAccount as unknown as Account;
  }

  /**
   * Get the Cartridge Controller instance.
   * Useful for accessing controller-specific features.
   *
   * @example
   * ```ts
   * const controller = wallet.getController();
   * controller.openProfile();
   * controller.openSettings();
   * const username = await controller.username();
   * ```
   */
  getController(): Controller {
    return this.controller;
  }

  /**
   * Disconnect from Cartridge Controller.
   */
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
