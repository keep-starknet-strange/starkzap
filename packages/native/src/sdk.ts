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
import { hasPoliciesInput } from "@/cartridge/ts/policy";
import { NativeCartridgeWallet } from "@/wallet/cartridge";
import type { CartridgeNativeConnectArgs } from "@/cartridge/types";

export class StarkZap extends CoreStarkZap {
  constructor(config: SDKConfig) {
    super(config);
  }

  override async connectCartridge(
    options: ConnectCartridgeOptions = {}
  ): Promise<Awaited<ReturnType<CoreStarkZap["connectCartridge"]>>> {
    await this.ensureProviderChainMatchesConfig();

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
    const { rpcUrl } = this.getSdkConfig();
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
    const config = this.getSdkConfig();
    return {
      ...(config.explorer && { explorer: config.explorer }),
      ...(config.staking && { staking: config.staking }),
    };
  }
}
