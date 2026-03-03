import {
  BaseWallet,
  Tx,
  fromAddress,
} from "starkzap";
import type {
  ChainId,
  DeployOptions,
  EnsureReadyOptions,
  ExecuteOptions,
  ExplorerConfig,
  FeeMode,
  PreflightOptions,
  PreflightResult,
  StakingConfig,
} from "starkzap";
import {
  RpcError,
  type Account,
  type Call,
  type EstimateFeeResponseOverhead,
  type PaymasterTimeBounds,
  type RpcProvider,
  type Signature,
  type TypedData,
} from "starknet";
import type { CartridgeNativeSessionHandle } from "@/cartridge/types";

const NEGATIVE_DEPLOYMENT_CACHE_TTL_MS = 3_000;

function sponsoredDetails(timeBounds?: PaymasterTimeBounds): {
  feeMode: { mode: "sponsored" };
  timeBounds?: PaymasterTimeBounds;
} {
  return {
    feeMode: { mode: "sponsored" },
    ...(timeBounds && { timeBounds }),
  };
}

function isContractNotFound(error: unknown): boolean {
  if (error instanceof RpcError) {
    return error.isType("CONTRACT_NOT_FOUND");
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("contract not found") ||
      message.includes("contract_not_found")
    );
  }

  return false;
}

function unsupportedDeployMessage(): string {
  return "Native Cartridge wallet does not support deployment in this release. Use deploy: \"never\" and sponsored session execution.";
}

function unsupportedUserPaysMessage(): string {
  return "Native Cartridge wallet currently supports sponsored session execution only. Use feeMode: \"sponsored\".";
}

export interface NativeCartridgeWalletOptions {
  session: CartridgeNativeSessionHandle;
  provider: RpcProvider;
  chainId: ChainId;
  classHash?: string;
  explorer?: ExplorerConfig;
  feeMode?: FeeMode;
  timeBounds?: PaymasterTimeBounds;
  staking?: StakingConfig;
}

export class NativeCartridgeWallet extends BaseWallet {
  private readonly session: CartridgeNativeSessionHandle;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly classHash: string;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: FeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;
  private deployedCache: boolean | null = null;
  private deployedCacheExpiresAt = 0;

  private constructor(options: NativeCartridgeWalletOptions) {
    const staking = options.staking;
    super(fromAddress(options.session.account.address), staking);
    this.session = options.session;
    this.provider = options.provider;
    this.chainId = options.chainId;
    this.classHash = options.classHash ?? "0x0";
    this.explorerConfig = options.explorer;
    this.defaultFeeMode = options.feeMode ?? "sponsored";
    this.defaultTimeBounds = options.timeBounds;
  }

  static async create(
    options: NativeCartridgeWalletOptions
  ): Promise<NativeCartridgeWallet> {
    let classHash = "0x0";
    try {
      classHash = await options.provider.getClassHashAt(
        fromAddress(options.session.account.address)
      );
    } catch {
      // Keep fallback hash for undeployed or unsupported providers.
    }

    return new NativeCartridgeWallet({
      ...options,
      classHash,
    });
  }

  async isDeployed(): Promise<boolean> {
    const now = Date.now();
    if (this.deployedCache === true) {
      return true;
    }
    if (this.deployedCache === false && now < this.deployedCacheExpiresAt) {
      return false;
    }

    try {
      const classHash = await this.provider.getClassHashAt(this.address);
      const deployed = !!classHash;
      this.deployedCache = deployed;
      this.deployedCacheExpiresAt = deployed
        ? Number.POSITIVE_INFINITY
        : now + NEGATIVE_DEPLOYMENT_CACHE_TTL_MS;
      return deployed;
    } catch (error) {
      if (!isContractNotFound(error)) {
        throw error;
      }
      this.deployedCache = false;
      this.deployedCacheExpiresAt = now + NEGATIVE_DEPLOYMENT_CACHE_TTL_MS;
      return false;
    }
  }

  async ensureReady(options: EnsureReadyOptions = {}): Promise<void> {
    const { deploy = "never", onProgress } = options;
    try {
      onProgress?.({ step: "CONNECTED" });
      onProgress?.({ step: "CHECK_DEPLOYED" });
      const deployed = await this.isDeployed();
      if (deployed) {
        onProgress?.({ step: "READY" });
        return;
      }
      if (deploy === "never") {
        throw new Error("Account not deployed and deploy mode is 'never'");
      }
      throw new Error(unsupportedDeployMessage());
    } catch (error) {
      onProgress?.({ step: "FAILED" });
      throw error;
    }
  }

  async deploy(_options: DeployOptions = {}): Promise<Tx> {
    throw new Error(unsupportedDeployMessage());
  }

  async execute(calls: Call[], options: ExecuteOptions = {}): Promise<Tx> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    if (feeMode !== "sponsored") {
      throw new Error(unsupportedUserPaysMessage());
    }
    const timeBounds = options.timeBounds ?? this.defaultTimeBounds;
    const response = await this.session.account.executePaymasterTransaction(
      calls,
      sponsoredDetails(timeBounds)
    );
    if (
      !response ||
      typeof response !== "object" ||
      typeof response.transaction_hash !== "string"
    ) {
      throw new Error(
        "Native Cartridge execution did not return a transaction hash."
      );
    }
    return new Tx(
      response.transaction_hash,
      this.provider,
      this.chainId,
      this.explorerConfig
    );
  }

  async signMessage(typedData: TypedData): Promise<Signature> {
    if (!this.session.account.signMessage) {
      throw new Error(
        "Native Cartridge session does not expose signMessage in this release."
      );
    }
    return this.session.account.signMessage(typedData);
  }

  async preflight(options: PreflightOptions): Promise<PreflightResult> {
    const feeMode = options.feeMode ?? this.defaultFeeMode;
    if (feeMode !== "sponsored") {
      return { ok: false, reason: unsupportedUserPaysMessage() };
    }
    const simulate = this.session.account.simulateTransaction;
    if (!simulate) {
      return { ok: true };
    }
    try {
      const simulation = await simulate([
        { type: "INVOKE", payload: options.calls },
      ]);
      const first = simulation[0] as
        | { transaction_trace?: { execute_invocation?: { revert_reason?: string } } }
        | undefined;
      const reason = first?.transaction_trace?.execute_invocation?.revert_reason;
      if (reason) {
        return { ok: false, reason };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  getAccount(): Account {
    return this.session.account as unknown as Account;
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

  async estimateFee(calls: Call[]): Promise<EstimateFeeResponseOverhead> {
    if (!this.session.account.estimateInvokeFee) {
      throw new Error(
        "Native Cartridge session does not expose estimateInvokeFee in this release."
      );
    }
    return this.session.account.estimateInvokeFee(calls);
  }

  getController(): unknown {
    return this.session.controller ?? this.session.account;
  }

  async username(): Promise<string | undefined> {
    if (!this.session.username) {
      return undefined;
    }
    return this.session.username();
  }

  async disconnect(): Promise<void> {
    this.clearCaches();
    this.deployedCache = null;
    this.deployedCacheExpiresAt = 0;
    await this.session.disconnect?.();
  }
}
