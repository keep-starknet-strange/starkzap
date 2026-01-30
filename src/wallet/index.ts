import {
  Account,
  RpcProvider,
  type Call,
  type ExecutableUserTransaction,
  type PaymasterTimeBounds,
  type PreparedTransaction,
  type TypedData,
  type Signature,
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
import type { SDKConfig, ExplorerConfig } from "../types/config.js";
import type { WalletInterface } from "./interface.js";
import {
  checkDeployed,
  ensureWalletReady,
  executeWithFeeMode,
  preflightTransaction,
  buildSponsoredTransaction,
} from "./utils.js";

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
  readonly address: string;

  private readonly provider: RpcProvider;
  private readonly account: Account;
  private readonly accountProvider: AccountProvider;
  private readonly explorerConfig: ExplorerConfig | undefined;
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
    this.explorerConfig = config.explorer;
    this.defaultFeeMode = defaultFeeMode;
    this.defaultTimeBounds = defaultTimeBounds;
  }

  /**
   * Create a new Wallet instance.
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
    const signerAdapter = new SignerAdapter(signer);

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

  async isDeployed(): Promise<boolean> {
    return checkDeployed(this.provider, this.address);
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    return ensureWalletReady(this, options);
  }

  async deploy(): Promise<Tx> {
    const classHash = this.accountProvider.getClassHash();
    const publicKey = await this.accountProvider.getPublicKey();
    const constructorCalldata =
      this.accountProvider.getConstructorCalldata(publicKey);

    const estimateFee = await this.account.estimateAccountDeployFee({
      classHash,
      constructorCalldata,
      addressSalt: publicKey,
    });

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
      { classHash, constructorCalldata, addressSalt: publicKey },
      { resourceBounds }
    );

    return new Tx(transaction_hash, this.provider, this.explorerConfig);
  }

  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    return executeWithFeeMode(
      this.account,
      calls,
      feeMode,
      timeBounds,
      this.provider,
      this.explorerConfig
    );
  }

  async signMessage(typedData: TypedData): Promise<Signature> {
    return this.account.signMessage(typedData);
  }

  async buildSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<PreparedTransaction> {
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;
    return buildSponsoredTransaction(
      this.account,
      calls,
      timeBounds
    ) as Promise<PreparedTransaction>;
  }

  async signSponsored(
    prepared: PreparedTransaction
  ): Promise<ExecutableUserTransaction> {
    return this.account.preparePaymasterTransaction(prepared);
  }

  async prepareSponsored(
    calls: Call[],
    options: PrepareOptions = {}
  ): Promise<ExecutableUserTransaction> {
    const prepared = await this.buildSponsored(calls, options);
    return this.signSponsored(prepared);
  }

  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    return preflightTransaction(this, this.account, options);
  }

  getAccount(): Account {
    return this.account;
  }

  async disconnect(): Promise<void> {
    // No-op for signer-based wallets
  }
}
