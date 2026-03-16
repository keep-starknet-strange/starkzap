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

export interface NativeOnboardCartridgeConfig
  extends Omit<CoreCartridgeConfig, "policies"> {
  policies?: CartridgePolicies;
  shouldOverridePresetPolicies?: boolean;
  redirectUrl?: string;
  forceNewSession?: boolean;
}

export interface OnboardCartridgeOptions extends Omit<
  CoreCartridgeOnboardOptions,
  "cartridge"
> {
  strategy: "cartridge";
  cartridge?: NativeOnboardCartridgeConfig;
}

export type OnboardOptions =
  | CoreNonCartridgeOnboardOptions
  | OnboardCartridgeOptions;

export interface ConnectCartridgeOptions extends NativeOnboardCartridgeConfig {
  feeMode?: FeeMode;
  timeBounds?: PaymasterTimeBounds;
}
