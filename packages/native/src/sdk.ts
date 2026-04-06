import type {
  OnboardOptions as CoreOnboardOptions,
  OnboardResult,
  SDKConfig,
} from "starkzap";
import { StarkZap as CoreStarkZap } from "starkzap";
import type {
  ConnectCartridgeOptions,
  OnboardOptions,
  NativeOnboardCartridgeConfig,
} from "@/types/onboard";
import {
  getCartridgeNativeAdapter,
  getCartridgeNativeAdapterOrThrow,
} from "@/cartridge/registry";
import { hasPoliciesInput } from "@/cartridge/ts/policy";
import {
  NativeCartridgeWallet,
  validateSupportedCartridgeFeeMode,
} from "@/wallet/cartridge";
import type {
  CartridgeNativeAdapter,
  CartridgeNativeConnectArgs,
} from "@/cartridge/types";

export class StarkZap extends CoreStarkZap {
  private cartridgeAdapter: CartridgeNativeAdapter | null;

  constructor(config: SDKConfig) {
    super(config);
    this.cartridgeAdapter = getCartridgeNativeAdapter();
  }

  override async connectCartridge(
    options: ConnectCartridgeOptions = {}
  ): Promise<Awaited<ReturnType<CoreStarkZap["connectCartridge"]>>> {
    const adapter = this.getCartridgeAdapterOrThrow();
    const feeMode = validateSupportedCartridgeFeeMode(options.feeMode);

    const policies = hasPoliciesInput(options.policies)
      ? options.policies
      : undefined;
    if (!policies && !options.preset) {
      throw new Error(
        "Cartridge session connection requires either non-empty policies or a preset that resolves policies for the active chain."
      );
    }

    await this.ensureProviderChainMatchesConfig();

    const provider = this.getProvider();
    const { bridging, chainId, explorer, rpcUrl, staking, logging } =
      this.getResolvedConfig();
    const walletExplorer = options.explorer ?? explorer;

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
      ...(walletExplorer && {
        explorer: walletExplorer,
      }),
      ...(bridging && { bridging }),
      ...(staking && { staking }),
      ...(logging && { logging }),
    });

    return wallet as Awaited<ReturnType<CoreStarkZap["connectCartridge"]>>;
  }

  override async onboard(
    options: CoreOnboardOptions | OnboardOptions
  ): Promise<OnboardResult> {
    if (options.strategy !== "cartridge") {
      return super.onboard(options as CoreOnboardOptions);
    }

    const deploy = options.deploy ?? "never";
    const feeMode = validateSupportedCartridgeFeeMode(options.feeMode);
    const timeBounds = options.timeBounds;
    const swapProviders = options.swapProviders;
    const defaultSwapProviderId = options.defaultSwapProviderId;
    const dcaProviders = options.dcaProviders;
    const defaultDcaProviderId = options.defaultDcaProviderId;
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

    if (swapProviders?.length) {
      for (const swapProvider of swapProviders) {
        wallet.registerSwapProvider(swapProvider);
      }
    }
    if (defaultSwapProviderId) {
      wallet.setDefaultSwapProvider(defaultSwapProviderId);
    }
    if (dcaProviders?.length) {
      for (const dcaProvider of dcaProviders) {
        wallet.dca().registerProvider(dcaProvider);
      }
    }
    if (defaultDcaProviderId) {
      wallet.dca().setDefaultProvider(defaultDcaProviderId);
    }

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

  private getCartridgeAdapterOrThrow(): CartridgeNativeAdapter {
    if (!this.cartridgeAdapter) {
      this.cartridgeAdapter = getCartridgeNativeAdapterOrThrow();
    }

    return this.cartridgeAdapter;
  }
}
