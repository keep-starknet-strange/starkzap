import {
  Account,
  type Call,
  hash,
  PaymasterRpc,
  type PaymasterTimeBounds,
  RpcProvider,
  type Signature,
  type TypedData,
} from "starknet";
import { Tx } from "@/tx";
import { AccountProvider } from "@/wallet/accounts/provider";
import type { SignerInterface } from "@/signer";
import { SignerAdapter } from "@/signer";
import type {
  AccountClassConfig,
  Address,
  BridgingConfig,
  ChainId,
  DeployOptions,
  EnsureReadyOptions,
  ExecuteOptions,
  ExplorerConfig,
  FeeMode,
  PreflightOptions,
  PreflightResult,
  ProviderOptions,
  SDKConfig,
  StakingConfig,
  TransactionProof,
} from "@/types";
import {
  assertProofFresh,
  assertProofSendable,
  checkDeployed,
  ensureWalletReady,
  normalizeFeeMode,
  paymasterDetails,
  preflightTransaction,
} from "@/wallet/utils";
import { createPrivacy, revokePrivacy } from "@/privacy/create";
import { withPaymaster, type PrivacyClient } from "@/privacy/client";
import { PROOF_BASE_BLOCK_DEPTH } from "@/privacy/sequencing";
import type { PrivacyConfig } from "@/privacy/create";
import type { WalletInterface } from "@/wallet/interface";
import { BaseWallet } from "@/wallet/base";
import {
  BRAAVOS_IMPL_CLASS_HASH,
  BraavosPreset,
  OpenZeppelinPreset,
} from "@/account/presets";
import type { LoggerConfig } from "@/logger";

// Braavos factory address (same on Sepolia and Mainnet)
const BRAAVOS_FACTORY_ADDRESS =
  "0x3d94f65ebc7552eb517ddb374250a9525b605f25f4e41ded6e7d7381ff1c2e8";
const NEGATIVE_DEPLOYMENT_CACHE_TTL_MS = 3_000;

export { type WalletInterface } from "@/wallet/interface";
export { BaseWallet } from "@/wallet/base";
export { AccountProvider } from "@/wallet/accounts/provider";

/**
 * Options for creating a Wallet.
 */
export interface WalletOptions extends ProviderOptions {
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
 * Register swap and DCA providers on a wallet from shared options.
 */
export function applyProviders(
  wallet: WalletInterface,
  options: ProviderOptions
): void {
  if (options.swapProviders?.length) {
    for (const provider of options.swapProviders) {
      wallet.registerSwapProvider(provider);
    }
  }
  if (options.defaultSwapProviderId) {
    wallet.setDefaultSwapProvider(options.defaultSwapProviderId);
  }
  if (options.dcaProviders?.length) {
    for (const provider of options.dcaProviders) {
      wallet.dca().registerProvider(provider);
    }
  }
  if (options.defaultDcaProviderId) {
    wallet.dca().setDefaultProvider(options.defaultDcaProviderId);
  }
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
export class Wallet extends BaseWallet {
  private readonly provider: RpcProvider;
  private readonly account: Account;
  private readonly accountProvider: AccountProvider;
  private readonly chainId: ChainId;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;
  private readonly privacyConfig: PrivacyConfig | undefined;
  private privacyClient: Promise<PrivacyClient> | null = null;
  private deployedCache: boolean | null = null;
  private deployedCacheExpiresAt = 0;
  private sponsoredDeployLock: Promise<void> | null = null;

  private constructor(options: {
    address: Address;
    accountProvider: AccountProvider;
    account: Account;
    provider: RpcProvider;
    chainId: ChainId;
    explorerConfig?: ExplorerConfig;
    defaultFeeMode: FeeMode;
    defaultTimeBounds?: PaymasterTimeBounds;
    privacyConfig?: PrivacyConfig | undefined;
    stakingConfig: StakingConfig | undefined;
    bridgingConfig?: BridgingConfig | undefined;
    logging?: LoggerConfig;
  }) {
    super({
      address: options.address,
      stakingConfig: options.stakingConfig,
      bridgingConfig: options.bridgingConfig,
      ...(options.logging && { logging: options.logging }),
    });
    this.accountProvider = options.accountProvider;
    this.account = options.account;
    this.provider = options.provider;
    this.chainId = options.chainId;
    this.explorerConfig = options.explorerConfig;
    this.defaultFeeMode = options.defaultFeeMode;
    this.defaultTimeBounds = options.defaultTimeBounds;
    this.privacyConfig = options.privacyConfig;
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
    const address = providedAddress ?? (await accountProvider.getAddress());

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

    if (!config.chainId) {
      throw new Error(
        "Wallet requires 'chainId' in the SDK config. Use 'network' or set 'chainId' explicitly."
      );
    }

    const wallet = new Wallet({
      address,
      accountProvider,
      account,
      provider,
      chainId: config.chainId,
      ...(config.explorer && { explorerConfig: config.explorer }),
      defaultFeeMode: feeMode,
      ...(timeBounds && { defaultTimeBounds: timeBounds }),
      ...(config.privacy && { privacyConfig: config.privacy }),
      stakingConfig: options.config.staking,
      bridgingConfig: options.config.bridging,
      ...(config.logging && { logging: config.logging }),
    });

    applyProviders(wallet, options);

    return wallet;
  }

  async isDeployed(): Promise<boolean> {
    const now = Date.now();

    // Return cached result if we know it's deployed
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

  private async withSponsoredDeployLock<T>(work: () => Promise<T>): Promise<T> {
    while (this.sponsoredDeployLock) {
      await this.sponsoredDeployLock;
    }

    let releaseLock: (() => void) | undefined;
    this.sponsoredDeployLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      return await work();
    } finally {
      releaseLock?.();
      this.sponsoredDeployLock = null;
    }
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    return ensureWalletReady(this, options);
  }

  async deploy(options: DeployOptions = {}): Promise<Tx> {
    this.clearDeploymentCache();
    const feeMode = normalizeFeeMode(options.feeMode ?? this.defaultFeeMode);
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    if (feeMode !== "user_pays") {
      return this.deployPaymasterWith([], timeBounds, feeMode.gasToken);
    }

    const classHash = this.accountProvider.getClassHash();
    const publicKey = await this.accountProvider.getPublicKey();
    const addressSalt = this.accountProvider.getSalt(publicKey);
    const constructorCalldata =
      this.accountProvider.getConstructorCalldata(publicKey);

    const multiply2x = (value: {
      max_amount: bigint;
      max_price_per_unit: bigint;
    }): { max_amount: bigint; max_price_per_unit: bigint } => {
      return {
        max_amount: value.max_amount * 2n,
        max_price_per_unit: value.max_price_per_unit * 2n,
      };
    };

    // Default resource bounds when estimate fails. L2 must cover Braavos deploy (~1M gas); prices meet network minimums (~47e12 for L1).
    const DEFAULT_DEPLOY_RESOURCE_BOUNDS = {
      l1_gas: { max_amount: 50_000n, max_price_per_unit: 50_000_000_000_000n },
      l2_gas: {
        max_amount: 1_100_000n,
        max_price_per_unit: 50_000_000_000_000n,
      },
      l1_data_gas: {
        max_amount: 50_000n,
        max_price_per_unit: 50_000_000_000_000n,
      },
    };

    let resourceBounds: typeof DEFAULT_DEPLOY_RESOURCE_BOUNDS;
    try {
      const estimateFee = await this.account.estimateAccountDeployFee({
        classHash,
        constructorCalldata,
        addressSalt,
      });
      const { l1_gas, l2_gas, l1_data_gas } = estimateFee.resourceBounds;
      resourceBounds = {
        l1_gas: multiply2x(l1_gas),
        l2_gas: multiply2x(l2_gas),
        l1_data_gas: multiply2x(l1_data_gas),
      };
    } catch {
      resourceBounds = DEFAULT_DEPLOY_RESOURCE_BOUNDS;
    }

    const { transaction_hash } = await this.account.deployAccount(
      { classHash, constructorCalldata, addressSalt },
      { resourceBounds }
    );

    return new Tx(
      transaction_hash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  private async deployPaymasterWith(
    calls: Call[],
    timeBounds?: PaymasterTimeBounds,
    gasToken?: Address
  ): Promise<Tx> {
    this.clearDeploymentCache();
    const classHash = this.accountProvider.getClassHash();

    // Special handling for Braavos - deploy via factory
    if (classHash === BraavosPreset.classHash) {
      return this.deployBraavosViaFactory(calls, timeBounds, gasToken);
    }

    // Standard deployment flow
    const deploymentData = await this.accountProvider.getDeploymentData();
    const { transaction_hash } = await this.account.executePaymasterTransaction(
      calls,
      paymasterDetails({
        feeMode: { type: "paymaster", ...(gasToken && { gasToken }) },
        timeBounds: timeBounds ?? this.defaultTimeBounds,
        deploymentData,
      })
    );
    return new Tx(
      transaction_hash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  /**
   * Deploy a Braavos account via the Braavos factory.
   *
   * This works by:
   * 1. Deploying a temporary OZ account (same public key) via paymaster
   * 2. Using that OZ account to call the Braavos factory
   * 3. The factory deploys the Braavos account
   */
  private async deployBraavosViaFactory(
    calls: Call[],
    timeBounds?: PaymasterTimeBounds,
    gasToken?: Address
  ): Promise<Tx> {
    const publicKey = await this.accountProvider.getPublicKey();
    const signer = this.accountProvider.getSigner();

    // Create a temporary OZ account provider for deployment
    const ozProvider = new AccountProvider(signer, OpenZeppelinPreset);
    const ozAddress = await ozProvider.getAddress();

    // Check if OZ bootstrap account is already deployed
    const ozDeployed = await checkDeployed(this.provider, ozAddress);

    // Build Braavos deployment params
    // Format: [impl_class_hash, ...9 zeros, chain_id, aux_sig_r, aux_sig_s]
    const chainIdFelt = this.chainId.toFelt252();

    // Build the aux data to sign: [impl_class_hash, 9 zeros, chain_id]
    const auxData: string[] = [
      BRAAVOS_IMPL_CLASS_HASH, // Implementation class hash
      "0x0",
      "0x0",
      "0x0",
      "0x0",
      "0x0",
      "0x0",
      "0x0",
      "0x0",
      "0x0", // 9 zeros for basic account
      chainIdFelt, // Chain ID
    ];

    // Hash the aux data with poseidon
    const auxHash = hash.computePoseidonHashOnElements(auxData);

    // Sign the aux hash
    const auxSignature = await signer.signRaw(auxHash);

    // Extract r and s from signature (handle both array and ArraySignatureType)
    const sigArray = Array.isArray(auxSignature)
      ? auxSignature
      : [auxSignature.r, auxSignature.s];

    if (!sigArray[0] || !sigArray[1]) {
      throw new Error("Invalid signature format from signer");
    }

    // Build the full additional_deployment_params
    const additionalParams: string[] = [
      ...auxData,
      String(sigArray[0]),
      String(sigArray[1]),
    ];

    // Build the factory call
    const factoryCall: Call = {
      contractAddress: BRAAVOS_FACTORY_ADDRESS,
      entrypoint: "deploy_braavos_account",
      calldata: [
        publicKey,
        String(additionalParams.length),
        ...additionalParams,
      ],
    };

    // Create starknet.js Account for the OZ bootstrap account
    const signerAdapter = new SignerAdapter(signer);
    const paymaster = this.account.paymaster;

    const ozAccount = new Account({
      provider: this.provider,
      address: ozAddress,
      signer: signerAdapter,
      ...(paymaster && { paymaster }),
    });

    const allCalls = [factoryCall, ...calls];
    const ozDeploymentData = ozDeployed
      ? undefined
      : await ozProvider.getDeploymentData();
    const { transaction_hash } = await ozAccount.executePaymasterTransaction(
      allCalls,
      paymasterDetails({
        feeMode: { type: "paymaster", ...(gasToken && { gasToken }) },
        timeBounds: timeBounds ?? this.defaultTimeBounds,
        deploymentData: ozDeploymentData,
      })
    );

    return new Tx(
      transaction_hash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = normalizeFeeMode(options.feeMode ?? this.defaultFeeMode);
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;

    assertProofSendable(options.proof, feeMode, options.unsafeUserPays);
    if (options.proof) {
      await assertProofFresh(
        options.proof,
        this.provider,
        PROOF_BASE_BLOCK_DEPTH
      );
    }

    const transactionHash =
      feeMode !== "user_pays"
        ? await this.executeSponsored(calls, timeBounds, feeMode.gasToken)
        : await this.executeUserPays(calls, options.proof);

    return new Tx(
      transactionHash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  private async executeUserPays(
    calls: Call[],
    proof?: TransactionProof
  ): Promise<string> {
    const deployed = await this.isDeployed();
    if (!deployed) {
      throw new Error(
        'Account is not deployed. Call wallet.ensureReady({ deploy: "if_needed" }) before execute() in user_pays mode.'
      );
    }

    const details = proof
      ? { proof: proof.data, proofFacts: proof.proofFacts }
      : undefined;
    return (await this.account.execute(calls, details)).transaction_hash;
  }

  private executePaymaster(
    calls: Call[],
    timeBounds: PaymasterTimeBounds | undefined,
    gasToken?: Address
  ): Promise<string> {
    return this.account
      .executePaymasterTransaction(
        calls,
        paymasterDetails({
          feeMode: { type: "paymaster", ...(gasToken && { gasToken }) },
          timeBounds,
        })
      )
      .then((r) => r.transaction_hash);
  }

  private async executeSponsored(
    calls: Call[],
    timeBounds: PaymasterTimeBounds | undefined,
    gasToken?: Address
  ): Promise<string> {
    if (await this.isDeployed()) {
      return this.executePaymaster(calls, timeBounds, gasToken);
    }

    return this.withSponsoredDeployLock(async () => {
      if (await this.isDeployed()) {
        return this.executePaymaster(calls, timeBounds, gasToken);
      }

      try {
        return (await this.deployPaymasterWith(calls, timeBounds, gasToken))
          .hash;
      } catch (error) {
        if (!isAlreadyDeployedError(error)) throw error;
        return this.executePaymaster(calls, timeBounds, gasToken);
      }
    });
  }

  async signMessage(typedData: TypedData): Promise<Signature> {
    return this.account.signMessage(typedData);
  }

  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    return preflightTransaction(this, this.account, {
      ...options,
      feeMode,
    });
  }

  getAccount(): Account {
    return this.account;
  }

  getProvider(): RpcProvider {
    return this.provider;
  }

  /**
   * Get the chain ID this wallet is connected to.
   */
  getChainId(): ChainId {
    return this.chainId;
  }

  /**
   * Get the default fee mode for this wallet.
   */
  getFeeMode(): FeeMode {
    return this.defaultFeeMode;
  }

  /**
   * Get the account class hash.
   */
  getClassHash(): string {
    return this.accountProvider.getClassHash();
  }

  /**
   * Get the {@link AccountProvider} backing this wallet.
   *
   * Exposes the signer, which is what key-derived features need — the privacy
   * pool's viewing key is derived from it. `CartridgeWallet` has no equivalent,
   * which is what keeps signer-dependent features off the Cartridge path at the
   * type level.
   */
  getAccountProvider(): AccountProvider {
    return this.accountProvider;
  }

  /**
   * Privacy pool client for this wallet, configured from `privacy` in the
   * SDK config.
   *
   * Returns a client that owns the pool fee, the proving block and submission —
   * see {@link PrivacyClient}. Submission goes through the paymaster's relayer,
   * so the account never appears on-chain; self-submitting would defeat the
   * point. For the privacy SDK's own client, use `createPrivacy` directly, or
   * read {@link PrivacyClient.transfers}.
   *
   * @returns A paymaster-bound privacy client
   * @throws If `privacy` is missing from the SDK config, or omits `paymaster`
   *
   * @example
   * ```ts
   * const sdk = new StarkZap({
   *   network: "mainnet",
   *   privacy: {
   *     poolContractAddress: POOL,
   *     prover: PROVER,
   *     discovery: DISCOVERY,
   *     paymaster: {
   *       url: "https://my-app.example.com/api/paymaster",
   *       fee: { mode: "sponsored" },
   *     },
   *   },
   * });
   * const wallet = await sdk.connectWallet({ account: { signer } });
   *
   * const privacy = await wallet.privacy();
   * const hash = await privacy.send((b) =>
   *   b.with(STRK, (t) => t.deposit({ amount })).surplusTo(wallet.address)
   * );
   * ```
   */
  async privacy(): Promise<PrivacyClient> {
    const config = this.privacyConfig;
    if (!config) {
      throw new Error(
        "[starkzap] wallet.privacy() requires 'privacy' in the SDK config. " +
          "Add it to StarkZap({ privacy: { poolContractAddress, prover, discovery, " +
          "paymaster: { url, fee } } }), or call createPrivacy(wallet, config) " +
          "directly."
      );
    }

    this.privacyClient ??= this.createPrivacyClient(config).catch(
      (error: unknown) => {
        // Don't cache a failure — a missing dependency or an unreachable
        // service should be retryable once fixed.
        this.privacyClient = null;
        throw error;
      }
    );

    return this.privacyClient;
  }

  /** Bind a privacy SDK client to the configured paymaster. */
  private async createPrivacyClient(
    config: PrivacyConfig
  ): Promise<PrivacyClient> {
    // One check, not two: `PrivacyPaymasterConfig` carries the endpoint and the
    // fee mode together, so there is no half-configured state to reject. The
    // fee mode is never defaulted — `default` needs no API key but its
    // withdrawal takes the suggested *maximum* gas rather than the estimate, so
    // choosing it unasked would overcharge on the user's behalf.
    if (!config.paymaster) {
      throw new Error(
        "[starkzap] Privacy transactions are submitted by a paymaster's relayer, " +
          "so `privacy.paymaster` is required. Use `{ url, fee: { mode: " +
          '"sponsored" } }` (relayer pays gas, pool fee in STRK — needs an API ' +
          "key, so point `url` at a proxy holding it), or `{ url, fee: { mode: " +
          '"default", gasToken } }` (no key, but the withdrawal takes the full ' +
          "suggested-max gas rather than refunding the unused part)."
      );
    }

    const transfers = await createPrivacy(this, config);

    return withPaymaster(transfers, {
      ...config.paymaster,
      poolContractAddress: config.poolContractAddress,
      provider: this.provider,
      chainId: this.chainId,
      // Only for `send({ invoke })`, which relays public calls alongside the
      // private transaction. The private path never signs: the proof authorises
      // it, which is what keeps this account off-chain.
      account: {
        address: this.address,
        signTypedData: (typedData) => this.signMessage(typedData),
      },
    });
  }

  /**
   * Estimate the fee for executing calls.
   *
   * @example
   * ```ts
   * const fee = await wallet.estimateFee([
   *   { contractAddress: "0x...", entrypoint: "transfer", calldata: [...] }
   * ]);
   * console.log(`Estimated fee: ${fee.overall_fee}`);
   * ```
   */
  async estimateFee(calls: Call[]) {
    return this.account.estimateInvokeFee(calls);
  }

  override async disconnect(): Promise<void> {
    await super.disconnect();
    this.clearDeploymentCache();

    // Revoked, not merely forgotten. Dropping the cache would leave the viewing
    // key alive inside any client the caller still holds — and the key outliving
    // the session that authorised it is the thing to prevent. Revoking cuts the
    // key off at its source, and since the SDK asks for it on every operation
    // rather than caching it, that ends every client built from this one.
    const client = this.privacyClient;
    this.privacyClient = null;
    await client?.then(
      (privacy) => revokePrivacy(privacy.transfers),
      // Creation failed, so there is no key to revoke. Swallowed rather than
      // rethrown: a failed client must not make disconnecting fail.
      () => undefined
    );
  }
}

function isAlreadyDeployedError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("already deployed") ||
    message.includes("account already exists") ||
    message.includes("contract already exists")
  );
}
