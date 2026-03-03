import type {
  CartridgeWalletInterface,
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

export class StarkZap extends CoreStarkZap {
  constructor(config: SDKConfig) {
    super(config);
  }

  override async connectCartridge(
    options: ConnectCartridgeOptions = {}
  ): Promise<CartridgeWalletInterface> {
    void options;
    throw new Error(
      "Native Cartridge connector is not implemented yet in @starkzap/native."
    );
  }

  async onboard(options: OnboardOptions): Promise<OnboardResult>;
  override async onboard(options: CoreOnboardOptions): Promise<OnboardResult>;
  override async onboard(
    options: CoreOnboardOptions | OnboardOptions
  ): Promise<OnboardResult> {
    if (options.strategy !== "cartridge") {
      return super.onboard(options as CoreOnboardOptions);
    }

    const deploy = options.deploy ?? "if_needed";
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
}
