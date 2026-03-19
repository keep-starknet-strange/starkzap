import { BaseWallet, Tx, fromAddress } from "starkzap";
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
  Account,
  RpcError,
  type Call,
  type DeclareSignerDetails,
  type DeployAccountSignerDetails,
  type EstimateFeeResponseOverhead,
  type InvocationsSignerDetails,
  type InvokeFunctionResponse,
  type PaymasterTimeBounds,
  type RpcProvider,
  type Signature,
  SignerInterface as StarknetSignerInterface,
  type SimulateTransactionDetails,
  type SimulateTransactionOverheadResponse,
  type TypedData,
  type UniversalDetails,
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
  return 'Cartridge wallet does not support deployment in this release. Use deploy: "never" and sponsored session execution.';
}

function unsupportedUserPaysMessage(): string {
  return 'Cartridge wallet currently supports sponsored session execution only. Use feeMode: "sponsored".';
}

export type SupportedNativeCartridgeFeeMode = Extract<FeeMode, "sponsored">;

export function validateSupportedCartridgeFeeMode(
  feeMode?: FeeMode
): SupportedNativeCartridgeFeeMode | undefined {
  if (feeMode === undefined || feeMode === "sponsored") {
    return feeMode;
  }

  throw new Error(unsupportedUserPaysMessage());
}

function resolveSupportedCartridgeFeeMode(
  feeMode?: FeeMode
): SupportedNativeCartridgeFeeMode {
  return validateSupportedCartridgeFeeMode(feeMode) ?? "sponsored";
}

function assertTransactionHashResponse(
  response: unknown
): asserts response is { transaction_hash: string } {
  const record = response as { transaction_hash?: unknown } | null;
  if (
    !record ||
    typeof record !== "object" ||
    typeof record.transaction_hash !== "string"
  ) {
    throw new Error("Cartridge execution did not return a transaction hash.");
  }
}

class NativeCartridgeSigner extends StarknetSignerInterface {
  constructor(private readonly session: CartridgeNativeSessionHandle) {
    super();
  }

  async getPubKey(): Promise<string> {
    throw new Error(
      "Cartridge session does not expose a Stark public key in this release."
    );
  }

  async signMessage(
    typedData: TypedData,
    _accountAddress: string
  ): Promise<Signature> {
    if (!this.session.account.signMessage) {
      throw new Error(
        "Cartridge session does not expose signMessage in this release."
      );
    }
    return this.session.account.signMessage(typedData);
  }

  async signTransaction(
    _transactions: Call[],
    _details: InvocationsSignerDetails
  ): Promise<Signature> {
    throw new Error(
      "Cartridge session does not expose raw invoke signing in this release. Use wallet.execute() or account.execute()."
    );
  }

  async signDeployAccountTransaction(
    _details: DeployAccountSignerDetails
  ): Promise<Signature> {
    throw new Error(unsupportedDeployMessage());
  }

  async signDeclareTransaction(
    _details: DeclareSignerDetails
  ): Promise<Signature> {
    throw new Error(
      "Cartridge session does not support declare signing in this release."
    );
  }
}

class NativeCartridgeAccount extends Account {
  private readonly session: CartridgeNativeSessionHandle;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;

  constructor(options: {
    session: CartridgeNativeSessionHandle;
    provider: RpcProvider;
    defaultTimeBounds?: PaymasterTimeBounds;
  }) {
    super({
      provider: options.provider,
      address: options.session.account.address,
      signer: new NativeCartridgeSigner(options.session),
    });
    this.session = options.session;
    this.defaultTimeBounds = options.defaultTimeBounds;
  }

  override async execute(
    transactions: Call | Call[],
    _details?: UniversalDetails
  ): Promise<InvokeFunctionResponse> {
    const calls = Array.isArray(transactions) ? transactions : [transactions];
    const response = await this.session.account.execute(
      calls,
      sponsoredDetails(this.defaultTimeBounds)
    );
    assertTransactionHashResponse(response);
    return response;
  }

  override async estimateInvokeFee(
    calls: Call | Call[],
    _details?: UniversalDetails
  ): Promise<EstimateFeeResponseOverhead> {
    if (!this.session.account.estimateInvokeFee) {
      throw new Error(
        "Cartridge session does not expose estimateInvokeFee in this release."
      );
    }
    return this.session.account.estimateInvokeFee(
      Array.isArray(calls) ? calls : [calls]
    );
  }

  override async simulateTransaction(
    invocations: Array<{ type: "INVOKE"; payload: Call[] }>,
    _details?: SimulateTransactionDetails
  ): Promise<SimulateTransactionOverheadResponse> {
    if (!this.session.account.simulateTransaction) {
      throw new Error(
        "Cartridge session does not expose simulateTransaction in this release."
      );
    }
    return this.session.account.simulateTransaction(
      invocations
    ) as Promise<SimulateTransactionOverheadResponse>;
  }

  override async signMessage(typedData: TypedData): Promise<Signature> {
    if (!this.session.account.signMessage) {
      throw new Error(
        "Cartridge session does not expose signMessage in this release."
      );
    }
    return this.session.account.signMessage(typedData);
  }
}

export interface NativeCartridgeWalletOptions {
  session: CartridgeNativeSessionHandle;
  provider: RpcProvider;
  chainId: ChainId;
  classHash?: string;
  explorer?: ExplorerConfig;
  feeMode?: SupportedNativeCartridgeFeeMode;
  timeBounds?: PaymasterTimeBounds;
  staking?: StakingConfig;
}

export class NativeCartridgeWallet extends BaseWallet {
  private readonly account: Account;
  private readonly session: CartridgeNativeSessionHandle;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;
  private readonly classHash: string | undefined;
  private readonly explorerConfig: ExplorerConfig | undefined;
  private readonly defaultFeeMode: SupportedNativeCartridgeFeeMode;
  private readonly defaultTimeBounds: PaymasterTimeBounds | undefined;
  private deployedCache: boolean | null = null;
  private deployedCacheExpiresAt = 0;

  private constructor(options: NativeCartridgeWalletOptions) {
    const staking = options.staking;
    super(fromAddress(options.session.account.address), staking);
    this.session = options.session;
    this.provider = options.provider;
    this.chainId = options.chainId;
    this.classHash = options.classHash;
    this.explorerConfig = options.explorer;
    this.defaultFeeMode = options.feeMode ?? "sponsored";
    this.defaultTimeBounds = options.timeBounds;
    this.account = new NativeCartridgeAccount({
      session: options.session,
      provider: options.provider,
      ...(options.timeBounds && { defaultTimeBounds: options.timeBounds }),
    });
  }

  static async create(
    options: NativeCartridgeWalletOptions
  ): Promise<NativeCartridgeWallet> {
    const feeMode = resolveSupportedCartridgeFeeMode(options.feeMode);
    let classHash: string | undefined;
    try {
      classHash = await options.provider.getClassHashAt(
        fromAddress(options.session.account.address)
      );
    } catch (error) {
      if (!isContractNotFound(error)) {
        throw error;
      }
    }

    return new NativeCartridgeWallet({
      ...options,
      ...(classHash !== undefined && { classHash }),
      ...(feeMode && { feeMode }),
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
    const response = await this.session.account.execute(
      calls,
      sponsoredDetails(timeBounds)
    );
    assertTransactionHashResponse(response);
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
        "Cartridge session does not expose signMessage in this release."
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
        | {
            transaction_trace?: {
              execute_invocation?: { revert_reason?: string };
            };
          }
        | undefined;
      const reason =
        first?.transaction_trace?.execute_invocation?.revert_reason;
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
    return this.account;
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
    if (!this.classHash) {
      throw new Error(
        "Account class hash is unavailable for undeployed Cartridge accounts."
      );
    }
    return this.classHash;
  }

  async estimateFee(calls: Call[]): Promise<EstimateFeeResponseOverhead> {
    if (!this.session.account.estimateInvokeFee) {
      throw new Error(
        "Cartridge session does not expose estimateInvokeFee in this release."
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
    try {
      const result = await this.session.username();
      return typeof result === "string" ? result : undefined;
    } catch {
      return undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.clearCaches();
    this.deployedCache = null;
    this.deployedCacheExpiresAt = 0;
    await this.session.disconnect?.();
  }
}
