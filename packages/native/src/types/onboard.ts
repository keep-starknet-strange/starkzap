import type { FeeMode, OnboardOptions as CoreOnboardOptions } from "starkzap";
import type { PaymasterTimeBounds } from "starknet";
import type { CartridgePolicies } from "@/cartridge/types";

type CoreCartridgeOnboardOptions = Extract<
  CoreOnboardOptions,
  { strategy: "cartridge" }
>;

type CoreNonCartridgeOnboardOptions = Exclude<
  CoreOnboardOptions,
  CoreCartridgeOnboardOptions
>;

type CoreCartridgeConfig = NonNullable<
  CoreCartridgeOnboardOptions["cartridge"]
>;

export interface NativeOnboardCartridgeConfig extends Omit<
  CoreCartridgeConfig,
  "policies"
> {
  policies?: CartridgePolicies;
  shouldOverridePresetPolicies?: boolean;
  redirectUrl?: string;
  forceNewSession?: boolean;
}

export interface OnboardCartridgeOptions extends Omit<
  CoreCartridgeOnboardOptions,
  "cartridge" | "deploy"
> {
  strategy: "cartridge";
  /**
   * Native Cartridge sessions do not support account deployment in this
   * release. Omit this option or set it to "never".
   */
  deploy?: "never";
  cartridge?: NativeOnboardCartridgeConfig;
}

export type OnboardOptions =
  | CoreNonCartridgeOnboardOptions
  | OnboardCartridgeOptions;

export interface ConnectCartridgeOptions extends NativeOnboardCartridgeConfig {
  feeMode?: FeeMode;
  timeBounds?: PaymasterTimeBounds;
}
