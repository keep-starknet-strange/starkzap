import type {
  ChainId,
  ExplorerConfig,
  OnboardOptions as CoreOnboardOptions,
  OnboardResult,
  RpcProvider,
  SDKConfig,
  StakingConfig,
} from "starkzap";
import {
  StarkZap as CoreStarkZap,
  getChainId,
  getStakingPreset,
  networks,
  type NetworkPreset,
} from "starkzap";
import type {
  ConnectCartridgeOptions,
  OnboardOptions,
  NativeOnboardCartridgeConfig,
} from "@/types/onboard";
import { getCartridgeNativeAdapterOrThrow } from "@/cartridge/registry";
import { hasPoliciesInput } from "@/cartridge/ts/policy";
import {
  NativeCartridgeWallet,
  validateSupportedCartridgeFeeMode,
} from "@/wallet/cartridge";
import type { CartridgeNativeConnectArgs } from "@/cartridge/types";

interface ResolvedNativeSdkConfig {
  chainId: ChainId;
  explorer?: ExplorerConfig;
  rpcUrl: string;
  staking?: StakingConfig;
}

function resolveProviderRpcUrl(provider: RpcProvider): string {
  const nodeUrl = provider.channel.nodeUrl;
  if (typeof nodeUrl === "string" && nodeUrl.length > 0) {
    return nodeUrl;
  }

  throw new Error(
    "Unable to resolve RPC URL from the SDK provider for Cartridge."
  );
}

function resolveNativeSdkConfig(
  config: SDKConfig,
  provider: RpcProvider
): ResolvedNativeSdkConfig {
  let networkPreset: NetworkPreset | undefined;
  if (config.network) {
    networkPreset =
      typeof config.network === "string"
        ? networks[config.network]
        : config.network;
  }

  const chainId = config.chainId ?? networkPreset?.chainId;
  if (!chainId) {
    throw new Error(
      "StarkZap requires either 'network' or 'chainId' to be specified"
    );
  }

  const explorer =
    config.explorer ??
    (networkPreset?.explorerUrl
      ? { baseUrl: networkPreset.explorerUrl }
      : undefined);
  const staking = config.staking ?? getStakingPreset(chainId);

  return {
    chainId,
    rpcUrl: resolveProviderRpcUrl(provider),
    ...(explorer && { explorer }),
    ...(staking && { staking }),
  };
}

export class StarkZap extends CoreStarkZap {
  private readonly nativeConfig: ResolvedNativeSdkConfig;
  private nativeChainValidationPromise: Promise<void> | null = null;

  constructor(config: SDKConfig) {
    super(config);
    this.nativeConfig = resolveNativeSdkConfig(config, this.getProvider());
  }

  override async connectCartridge(
    options: ConnectCartridgeOptions = {}
  ): Promise<Awaited<ReturnType<CoreStarkZap["connectCartridge"]>>> {
    await this.ensureNativeProviderChainMatchesConfig();
    const feeMode = validateSupportedCartridgeFeeMode(options.feeMode);

    const adapter = getCartridgeNativeAdapterOrThrow();

    const policies = options.policies;
    if (!hasPoliciesInput(policies) && !options.preset) {
      throw new Error(
        "Cartridge session connection requires either non-empty policies or a preset that resolves policies for the active chain."
      );
    }

    const provider = this.getProvider();
    const chainId = await getChainId(provider);
    const rpcUrl = this.resolveProviderRpcUrl();
    const internals = this.getResolvedInternals();

    const args: CartridgeNativeConnectArgs = {
      rpcUrl,
      chainId: chainId.toFelt252(),
      ...(policies ? { policies } : {}),
      ...(options.preset && { preset: options.preset }),
      ...(options.shouldOverridePresetPolicies !== undefined && {
        shouldOverridePresetPolicies: options.shouldOverridePresetPolicies,
      }),
      ...(options.url && { url: options.url }),
      ...(options.redirectUrl && { redirectUrl: options.redirectUrl }),
      ...(options.forceNewSession !== undefined && {
        forceNewSession: options.forceNewSession,
      }),
    };

    const session = await adapter.connect(args);

    const wallet = await NativeCartridgeWallet.create({
      session,
      provider,
      chainId,
      ...(feeMode && { feeMode }),
      ...(options.timeBounds && { timeBounds: options.timeBounds }),
      ...((options.explorer ?? internals.explorer) && {
        explorer: options.explorer ?? internals.explorer,
      }),
      ...(internals.staking && { staking: internals.staking }),
    });

    return wallet as Awaited<ReturnType<CoreStarkZap["connectCartridge"]>>;
  }

  async onboard(options: OnboardOptions): Promise<OnboardResult>;
  override async onboard(options: CoreOnboardOptions): Promise<OnboardResult>;
  override async onboard(
    options: CoreOnboardOptions | OnboardOptions
  ): Promise<OnboardResult> {
    if (options.strategy !== "cartridge") {
      return super.onboard(options as CoreOnboardOptions);
    }

    const deploy = options.deploy ?? "never";
    const feeMode = validateSupportedCartridgeFeeMode(options.feeMode);
    const timeBounds = options.timeBounds;
    const shouldEnsureReady = deploy !== "never";

    const nativeCartridge =
      "cartridge" in options
        ? (options.cartridge as NativeOnboardCartridgeConfig | undefined)
        : undefined;

    const wallet = await this.connectCartridge({
      ...(nativeCartridge ?? {}),
      ...(feeMode && { feeMode }),
      ...(timeBounds && { timeBounds }),
    });

    if (shouldEnsureReady) {
      await wallet.ensureReady({
        deploy,
        ...(feeMode && { feeMode }),
        ...(options.onProgress && { onProgress: options.onProgress }),
      });
    }

    return {
      wallet,
      strategy: options.strategy,
      deployed: await wallet.isDeployed(),
    };
  }

  private async ensureNativeProviderChainMatchesConfig(): Promise<void> {
    if (!this.nativeChainValidationPromise) {
      this.nativeChainValidationPromise = (async () => {
        const providerChainId = await getChainId(this.getProvider());
        if (
          providerChainId.toLiteral() !== this.nativeConfig.chainId.toLiteral()
        ) {
          throw new Error(
            `RPC chain mismatch: provider returned ${providerChainId.toLiteral()} but SDK is configured for ${this.nativeConfig.chainId.toLiteral()}.`
          );
        }
      })().catch((error) => {
        this.nativeChainValidationPromise = null;
        throw error;
      });
    }

    await this.nativeChainValidationPromise;
  }

  private resolveProviderRpcUrl(): string {
    const { rpcUrl } = this.nativeConfig;
    if (rpcUrl.length > 0) {
      return rpcUrl;
    }

    throw new Error(
      "Unable to resolve RPC URL from the SDK provider for Cartridge."
    );
  }

  private getResolvedInternals(): {
    explorer?: ExplorerConfig;
    staking?: StakingConfig;
  } {
    const config = this.nativeConfig;
    return {
      ...(config.explorer && { explorer: config.explorer }),
      ...(config.staking && { staking: config.staking }),
    };
  }
}
