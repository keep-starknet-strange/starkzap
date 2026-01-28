import {
  Account,
  RpcProvider,
  type Call,
  type ExecutableUserTransaction,
  type PaymasterTimeBounds,
  type PreparedTransaction,
  type TypedData,
  type Signature,
  TransactionFinalityStatus,
} from "starknet";
import { Tx } from "../tx/index.js";
import { AccountProvider } from "./accounts/provider.js";
import { SignerAdapter } from "../signer/adapter.js";
import type {
  EnsureReadyOptions,
  ExecuteOptions,
  FeeMode,
  PreflightOptions,
  PreflightResult,
  PrepareOptions,
} from "../types/wallet.js";
import type { SDKConfig } from "../types/config.js";
import type { WalletInterface } from "./interface.js";
import { Address } from "../types/address.js";

export { type WalletInterface } from "./interface.js";

/**
 * Wallet implementation using a custom signer and account preset.
 *
 * This is the default wallet implementation that uses:
 * - A `SignerInterface` for signing (e.g., `StarkSigner` with a private key)
 * - An `AccountClassConfig` preset (e.g., `OpenZeppelinPreset`, `ArgentPreset`)
 *
 * For Cartridge Controller integration, use `CartridgeWallet` instead.
 *
 * @example
 * ```ts
 * const wallet = await sdk.connectWallet({
 *   account: {
 *     signer: new StarkSigner(privateKey),
 *     accountClass: OpenZeppelinPreset,
 *   }
 * });
 * ```
 */
export class Wallet implements WalletInterface {
  private readonly provider: RpcProvider;
  private readonly account: Account;
  private readonly accountProvider: AccountProvider;
  private readonly config: SDKConfig;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;

  private constructor(
    accountProvider: AccountProvider,
    account: Account,
    provider: RpcProvider,
    config: SDKConfig,
    defaultFeeMode: FeeMode = "user_pays",
    defaultTimeBounds?: PaymasterTimeBounds
  ) {
    this.accountProvider = accountProvider;
    this.account = account;
    this.provider = provider;
    this.config = config;
    this.defaultFeeMode = defaultFeeMode;
    this.defaultTimeBounds = defaultTimeBounds;
  }

  /**
   * Create a new Wallet instance.
   * Use this instead of constructor since address computation is async.
   */
  static async create(
    accountProvider: AccountProvider,
    provider: RpcProvider,
    config: SDKConfig,
    defaultFeeMode: FeeMode = "user_pays",
    defaultTimeBounds?: PaymasterTimeBounds
  ): Promise<Wallet> {
    const address = await accountProvider.getAddress();
    const signer = accountProvider.getSigner();

    // Wrap the SDK signer in an adapter for starknet.js compatibility
    const signerAdapter = new SignerAdapter(signer);

    // Create account with optional custom paymaster
    const accountOptions = {
      provider,
      address,
      signer: signerAdapter,
      ...(config.paymaster && { paymaster: config.paymaster }),
    };
    const account = new Account(accountOptions);

    return new Wallet(
      accountProvider,
      account,
      provider,
      config,
      defaultFeeMode,
      defaultTimeBounds
    );
  }

  /**
   * Check if the account contract is deployed on-chain.
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
   * Optionally deploys the account if needed.
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
   * Deploy the account contract.
   * Returns a Tx object to track the deployment.
   *
   * Note: Sponsored deployment is not supported by most paymasters.
   * Deployment uses user_pays fee mode with a 2x safety margin on estimated fees.
   */
  async deploy(): Promise<Tx> {
    const classHash = this.accountProvider.getClassHash();
    const publicKey = await this.accountProvider.getPublicKey();
    const constructorCalldata =
      this.accountProvider.getConstructorCalldata(publicKey);

    // Estimate fees first
    const estimateFee = await this.account.estimateAccountDeployFee({
      classHash,
      constructorCalldata,
      addressSalt: publicKey,
    });

    // Apply 2x multiplier to resource bounds for safety margin
    const multiply2x = (value: unknown): bigint =>
      BigInt(String(value ?? 0)) * 2n;

    const { l1_gas, l2_gas, l1_data_gas } = estimateFee.resourceBounds;

    const resourceBounds = {
      l1_gas: {
        max_amount: multiply2x(l1_gas.max_amount),
        max_price_per_unit: multiply2x(l1_gas.max_price_per_unit),
      },
      l2_gas: {
        max_amount: multiply2x(l2_gas.max_amount),
        max_price_per_unit: multiply2x(l2_gas.max_price_per_unit),
      },
      l1_data_gas: {
        max_amount: multiply2x(l1_data_gas?.max_amount),
        max_price_per_unit: multiply2x(l1_data_gas?.max_price_per_unit),
      },
    };

    const { transaction_hash } = await this.account.deployAccount(
      {
        classHash,
        constructorCalldata,
        addressSalt: publicKey,
      },
      { resourceBounds }
    );

    return new Tx(transaction_hash, this.provider, this.config.explorer);
  }

  /**
   * Execute one or more contract calls.
   * Returns a Tx object to track the transaction.
   *
   * When feeMode="sponsored", uses AVNU paymaster for gasless transactions.
   */
  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    if (feeMode === "sponsored") {
      // Use AVNU paymaster for sponsored transactions
      const paymasterDetails = {
        feeMode: { mode: "sponsored" as const },
        ...(timeBounds && { timeBounds }),
      };

      const { transaction_hash } =
        await this.account.executePaymasterTransaction(calls, paymasterDetails);

      return new Tx(transaction_hash, this.provider, this.config.explorer);
    }

    // User pays: let starknet.js estimate fees
    const { transaction_hash } = await this.account.execute(calls);

    return new Tx(transaction_hash, this.provider, this.config.explorer);
  }

  /**
   * Sign a typed data message (EIP-712 style).
   * Returns the signature.
   */
  async signMessage(typedData: TypedData): Promise<Signature> {
    return this.account.signMessage(typedData);
  }

  /**
   * Build a sponsored transaction for the paymaster.
   * Returns the prepared transaction with typed data and fee estimate.
   *
   * Use this when you want to inspect the transaction before signing,
   * or when you need to handle signing separately.
   *
   * @example
   * ```ts
   * const prepared = await wallet.buildSponsored(calls);
   * console.log("Fee estimate:", prepared.fee);
   * console.log("Typed data:", prepared.typed_data);
   *
   * // Then sign and get executable transaction
   * const executable = await wallet.signSponsored(prepared);
   * ```
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

    return this.account.buildPaymasterTransaction(calls, paymasterDetails);
  }

  /**
   * Sign a prepared sponsored transaction.
   * Returns the executable transaction ready to be relayed by the paymaster.
   *
   * @example
   * ```ts
   * const prepared = await wallet.buildSponsored(calls);
   * const executable = await wallet.signSponsored(prepared);
   *
   * // The executable can be sent to your backend for relay
   * await fetch('/api/relay', {
   *   method: 'POST',
   *   body: JSON.stringify(executable)
   * });
   * ```
   */
  async signSponsored(
    prepared: PreparedTransaction
  ): Promise<ExecutableUserTransaction> {
    return this.account.preparePaymasterTransaction(prepared);
  }

  /**
   * Build and sign a sponsored transaction in one step.
   * Returns the executable transaction ready to be relayed by the paymaster.
   *
   * @example
   * ```ts
   * const executable = await wallet.prepareSponsored(calls);
   *
   * // Send to your backend or paymaster for relay
   * const response = await fetch('https://paymaster.avnu.fi/v1/execute', {
   *   method: 'POST',
   *   body: JSON.stringify(executable)
   * });
   * ```
   */
  async prepareSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<ExecutableUserTransaction> {
    const prepared = await this.buildSponsored(calls, options);
    return this.signSponsored(prepared);
  }

  /**
   * Check if a transaction can succeed before attempting it.
   * Simulates the calls and returns any revert reason.
   */
  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    const { calls } = options;

    try {
      // Check deployment status
      const deployed = await this.isDeployed();
      if (!deployed) {
        return { ok: false, reason: "Account not deployed" };
      }

      // Simulate transaction
      const simulation = await this.account.simulateTransaction([
        { type: "INVOKE", payload: calls },
      ]);

      const result = simulation[0];
      if (result && "transaction_trace" in result && result.transaction_trace) {
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
   * Use this for advanced operations not covered by the SDK.
   */
  getAccount(): Account {
    return this.account;
  }

  /**
   * Disconnect the wallet and clean up resources.
   * For signer-based wallets, this is a no-op since there's no persistent connection.
   */
  async disconnect(): Promise<void> {
    // No-op for signer-based wallets
  }
}
