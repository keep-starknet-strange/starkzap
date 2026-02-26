import {
  RpcProvider,
  WalletAccount,
  type Account,
  type Call,
  type TypedData,
  type Signature,
  type ProviderOptions,
} from "starknet";
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core";
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
  type StakingConfig,
  fromAddress,
} from "@/types";
import {
  checkDeployed,
  ensureWalletReady,
  preflightTransaction,
} from "@/wallet/utils";
import { BaseWallet } from "@/wallet/base";
import { assertSafeHttpUrl } from "@/utils";

const NEGATIVE_DEPLOYMENT_CACHE_TTL_MS = 3_000;

export interface BrowserWalletOptions {
  rpcUrl?: string;
  chainId?: ChainId;
  feeMode?: FeeMode;
  explorer?: ExplorerConfig;
}

/**
 * Wallet implementation wrapping a browser extension wallet (ArgentX, Braavos).
 *
 * Uses @starknet-io/get-starknet to connect to an installed extension.
 * The private key never leaves the extension — all signing happens inside it.
 * Internally uses starknet.js WalletAccount, the battle-tested browser wallet abstraction.
 *
 * @example
 * ```ts
 * import { connect } from "@starknet-io/get-starknet";
 * import { StarkSDK } from "starkzap";
 *
 * const starknet = await connect(); // triggers extension popup
 * if (!starknet) throw new Error("No wallet found");
 *
 * const sdk = new StarkSDK({ network: "mainnet" });
 * const { wallet } = await sdk.onboard({
 *   strategy: "browser",
 *   walletProvider: starknet,
 * });
 *
 * await wallet.execute([...]);
 * ```
 */
export class BrowserWallet extends BaseWallet {
  private readonly walletAccount: WalletAccount;
  private readonly walletProvider: StarknetWindowObject;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly classHash: string;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private deployedCache: boolean | null = null;
  private deployedCacheExpiresAt = 0;

  private constructor(
    walletAccount: WalletAccount,
    walletProvider: StarknetWindowObject,
    provider: RpcProvider,
    chainId: ChainId,
    classHash: string,
    stakingConfig: StakingConfig | undefined,
    options: BrowserWalletOptions = {}
  ) {
    super(fromAddress(walletAccount.address), stakingConfig);
    this.walletAccount = walletAccount;
    this.walletProvider = walletProvider;
    this.provider = provider;
    this.chainId = chainId;
    this.classHash = classHash;
    this.explorerConfig = options.explorer;
    this.defaultFeeMode = options.feeMode ?? "user_pays";
  }

  /**
   * Create a BrowserWallet from a get-starknet StarknetWindowObject.
   *
   * The wallet must already be connected via connect() from @starknet-io/get-starknet
   * before calling this. starknet.js WalletAccount handles the signing bridge internally.
   */
  static async create(
    walletProvider: StarknetWindowObject,
    options: BrowserWalletOptions = {},
    stakingConfig?: StakingConfig
  ): Promise<BrowserWallet> {
    const nodeUrl = options.rpcUrl
      ? assertSafeHttpUrl(options.rpcUrl, "BrowserWallet RPC URL").toString()
      : undefined;

    const providerOptions: ProviderOptions = nodeUrl ? { nodeUrl } : {};
    const provider = new RpcProvider(providerOptions);

    // WalletAccount.connect() is the starknet.js-blessed way to wrap a browser
    // extension. It handles the signing bridge so we never touch the private key.
    const walletAccount = await WalletAccount.connect(
      providerOptions,
      walletProvider
    );

    if (!walletAccount?.address) {
      throw new Error(
        "BrowserWallet: failed to connect. Make sure the wallet is unlocked and a connection was approved."
      );
    }

    const chainId = options.chainId ?? (await getChainId(provider));

    let classHash = "0x0";
    try {
      classHash = await provider.getClassHashAt(
        fromAddress(walletAccount.address)
      );
    } catch {
      // Keep "0x0" for undeployed accounts.
    }

    return new BrowserWallet(
      walletAccount,
      walletProvider, 
      provider,
      chainId,
      classHash,
      stakingConfig,
      options
    );
  }

  async isDeployed(): Promise<boolean> {
    const now = Date.now();
    if (this.deployedCache === true) return true;
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

  async deploy(_options: DeployOptions = {}): Promise<Tx> {
    // Browser extension wallets deploy the account on the user's first
    // transaction. We cannot trigger it programmatically from outside.
    throw new Error(
      "BrowserWallet does not support programmatic deployment. " +
        "The extension wallet deploys the account automatically on first transaction."
    );
  }

  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;

    if (feeMode === "sponsored") {
      throw new Error(
        "BrowserWallet does not support sponsored transactions. " +
          "Use the cartridge strategy for gasless flows."
      );
    }

    const deployed = await this.isDeployed();
    if (!deployed) {
      throw new Error(
        'Account is not deployed. Call wallet.ensureReady({ deploy: "if_needed" }) before execute() in user_pays mode.'
      );
    }

    const { transaction_hash } = await this.walletAccount.execute(calls);
    this.clearDeploymentCache();

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
    return preflightTransaction(this, this.walletAccount as unknown as Account, {
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

 async disconnect(): Promise<void> {
  this.clearCaches();
  this.clearDeploymentCache();
  const provider = this.walletProvider as unknown as {
    disconnect?: () => Promise<void>;
  };
  if (typeof provider.disconnect === "function") {
    await provider.disconnect();
  }
 }
}