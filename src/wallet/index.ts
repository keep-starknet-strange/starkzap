import {
  Account,
  RpcProvider,
  PaymasterRpc,
  type Call,
  type PaymasterTimeBounds,
  type TypedData,
  type Signature,
} from "starknet";
import { Tx } from "@/tx";
import { AccountProvider } from "@/wallet/accounts/provider";
import { SignerAdapter } from "@/signer";
import type { SignerInterface } from "@/signer";
import type {
  AccountClassConfig,
  EnsureReadyOptions,
  ExecuteOptions,
  FeeMode,
  PreflightOptions,
  PreflightResult,
} from "@/types";
import type { SDKConfig, ExplorerConfig } from "@/types";
import { Address } from "@/types";
import type { WalletInterface } from "@/wallet/interface";
import {
  checkDeployed,
  ensureWalletReady,
  preflightTransaction,
  sponsoredDetails,
} from "@/wallet/utils";

export { type WalletInterface } from "@/wallet/interface";
export { AccountProvider } from "@/wallet/accounts/provider";

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
  /** Known address (skips address computation if provided) */
  accountAddress?: Address;
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
   * // With signer (address computed from public key)
   * const wallet = await Wallet.create({
   *   account: { signer: new StarkSigner(privateKey), accountClass: ArgentPreset },
   *   provider,
   *   config,
   * });
   *
   * // With known address (skips address computation)
   * const wallet = await Wallet.create({
   *   account: { signer: new StarkSigner(privateKey) },
   *   address: "0x123...",
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
      accountAddress: providedAddress,
      feeMode = "user_pays",
      timeBounds,
    } = options;

    // Build or use provided AccountProvider
    const accountProvider =
      accountInput instanceof AccountProvider
        ? accountInput
        : new AccountProvider(accountInput.signer, accountInput.accountClass);

    // Use provided address or compute from account provider
    const address = providedAddress
      ? Address.from(providedAddress)
      : await accountProvider.getAddress();

    const signer = accountProvider.getSigner();

    // Create starknet.js Account with our signer adapter
    const signerAdapter = new SignerAdapter(signer);

    // Create PaymasterRpc instance if paymaster config is provided
    const paymaster = config.paymaster
      ? new PaymasterRpc(config.paymaster)
      : undefined;

    const account = new Account({
      provider,
      address,
      signer: signerAdapter,
      ...(paymaster && { paymaster }),
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

    let transactionHash: string;

    if (feeMode === "sponsored") {
      // Check if account needs deployment (paymaster can deploy + invoke in one tx)
      const deployed = await this.isDeployed();
      const deploymentData = deployed
        ? undefined
        : await this.accountProvider.getDeploymentData();

      const { transaction_hash } =
        await this.account.executePaymasterTransaction(
          calls,
          sponsoredDetails(timeBounds, deploymentData)
        );
      transactionHash = transaction_hash;
    } else {
      const { transaction_hash } = await this.account.execute(calls);
      transactionHash = transaction_hash;
    }

    return new Tx(transactionHash, this.provider, this.explorerConfig);
  }

  async signMessage(typedData: TypedData): Promise<Signature> {
    return this.account.signMessage(typedData);
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
