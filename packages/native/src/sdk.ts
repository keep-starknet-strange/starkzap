import type {
  ExplorerConfig,
  OnboardOptions as CoreOnboardOptions,
  OnboardResult,
  SDKConfig,
  StakingConfig,
} from "starkzap";
import { StarkZap as CoreStarkZap, getChainId } from "starkzap";
import type {
  ConnectCartridgeOptions,
  OnboardOptions,
  NativeOnboardCartridgeConfig,
} from "@/types/onboard";
import { getCartridgeNativeAdapterOrThrow } from "@/cartridge/registry";
import { NativeCartridgeWallet } from "@/wallet/cartridge";
import type { CartridgeNativeConnectArgs } from "@/cartridge/types";

export class StarkZap extends CoreStarkZap {
  constructor(config: SDKConfig) {
    super(config);
  }

  override async connectCartridge(
    options: ConnectCartridgeOptions = {}
  ): Promise<Awaited<ReturnType<CoreStarkZap["connectCartridge"]>>> {
    const ensureProviderChainMatchesConfig = (
      this as unknown as {
        ensureProviderChainMatchesConfig?: () => Promise<void>;
      }
    ).ensureProviderChainMatchesConfig;
    if (typeof ensureProviderChainMatchesConfig === "function") {
      await ensureProviderChainMatchesConfig.call(this);
    }

    const adapter = getCartridgeNativeAdapterOrThrow();
    const provider = this.getProvider();
    const chainId = await getChainId(provider);
    const rpcUrl = this.resolveProviderRpcUrl();
    const internals = this.getResolvedInternals();

    const args: CartridgeNativeConnectArgs = {
      rpcUrl,
      chainId: chainId.toFelt252(),
      ...(options.policies && { policies: options.policies }),
      ...(options.preset && { preset: options.preset }),
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
      ...(options.feeMode && { feeMode: options.feeMode }),
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
    const feeMode = options.feeMode;
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

  private resolveProviderRpcUrl(): string {
    const config = (this as unknown as {
      config?: { rpcUrl?: unknown };
    }).config;
    const configRpcUrl = config?.rpcUrl;
    if (typeof configRpcUrl === "string" && configRpcUrl.length > 0) {
      return configRpcUrl;
    }

    const provider = this.getProvider() as unknown as {
      channel?: { nodeUrl?: unknown };
    };
    const nodeUrl = provider.channel?.nodeUrl;
    if (typeof nodeUrl === "string" && nodeUrl.length > 0) {
      return nodeUrl;
    }
    throw new Error(
      "Unable to resolve RPC URL from the SDK provider for native Cartridge."
    );
  }

  private getResolvedInternals(): {
    explorer?: ExplorerConfig;
    staking?: StakingConfig;
  } {
    const config = (this as unknown as {
      config?: { explorer?: ExplorerConfig; staking?: StakingConfig };
    }).config;
    if (!config) {
      return {};
    }
    return {
      ...(config.explorer && { explorer: config.explorer }),
      ...(config.staking && { staking: config.staking }),
    };
  }
}
