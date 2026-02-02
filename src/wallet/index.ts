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
import type { SignerInterface } from "../signer/interface.js";
import type {
  AccountClassConfig,
  EnsureReadyOptions,
  ExecuteOptions,
  FeeMode,
  PreflightOptions,
  PreflightResult,
  PrepareOptions,
} from "../types/wallet.js";
import type { SDKConfig, ExplorerConfig } from "../types/config.js";
import { Address } from "../types/address.js";
import type { WalletInterface } from "./interface.js";
import {
  checkDeployed,
  ensureWalletReady,
  executeWithFeeMode,
  preflightTransaction,
  buildSponsoredTransaction,
} from "./utils.js";

export { type WalletInterface } from "./interface.js";
export { AccountProvider } from "./accounts/provider.js";

/**
 * Options for creating a Wallet.
 */
export interface WalletOptions {
  /** Account: either AccountProvider or { signer, accountClass? } */
  account:
    | AccountProvider
    | { signer: SignerInterface; accountClass?: AccountClassConfig };
  /** RPC provider */
  provider: RpcProvider;
  /** SDK configuration */
  config: SDKConfig;
  /** Default fee mode (default: "user_pays") */
  feeMode?: FeeMode;
  /** Default time bounds for paymaster transactions */
  timeBounds?: PaymasterTimeBounds;
}

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
 * const wallet = await Wallet.create({
 *   signer: new StarkSigner(privateKey),
 *   accountClass: ArgentPreset,
 *   provider,
 *   config,
 * });
 * ```
 */
export class Wallet implements WalletInterface {
  readonly address: Address;

  private readonly provider: RpcProvider;
  private readonly account: Account;
  private readonly accountProvider: AccountProvider;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;

  private constructor(
    address: Address,
    accountProvider: AccountProvider,
    account: Account,
    provider: RpcProvider,
    explorerConfig: ExplorerConfig | undefined,
    defaultFeeMode: FeeMode,
    defaultTimeBounds: PaymasterTimeBounds | undefined
  ) {
    this.address = address;
    this.accountProvider = accountProvider;
    this.account = account;
    this.provider = provider;
    this.explorerConfig = explorerConfig;
    this.defaultFeeMode = defaultFeeMode;
    this.defaultTimeBounds = defaultTimeBounds;
  }

  /**
   * Create a new Wallet instance.
   *
   * @example
   * ```ts
   * // With signer
   * const wallet = await Wallet.create({
   *   account: { signer: new StarkSigner(privateKey), accountClass: ArgentPreset },
   *   provider,
   *   config,
   * });
   *
   * // With AccountProvider
   * const wallet = await Wallet.create({
   *   account: new AccountProvider(signer, accountClass),
   *   provider,
   *   config,
   * });
   * ```
   */
  static async create(options: WalletOptions): Promise<Wallet> {
    const {
      account: accountInput,
      provider,
      config,
      feeMode = "user_pays",
      timeBounds,
    } = options;

    // Build or use provided AccountProvider
    const accountProvider =
      accountInput instanceof AccountProvider
        ? accountInput
        : new AccountProvider(accountInput.signer, accountInput.accountClass);

    const address = await accountProvider.getAddress();
    const signer = accountProvider.getSigner();

    // Create starknet.js Account with our signer adapter
    const signerAdapter = new SignerAdapter(signer);
    const account = new Account({
      provider,
      address,
      signer: signerAdapter,
      ...(config.paymaster && { paymaster: config.paymaster }),
    });

    return new Wallet(
      address,
      accountProvider,
      account,
      provider,
      config.explorer,
      feeMode,
      timeBounds
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

  getProvider(): RpcProvider {
    return this.provider;
  }

  async disconnect(): Promise<void> {
    // No-op for signer-based wallets
  }
}
