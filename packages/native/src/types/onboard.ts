import type {
  ConnectCartridgeBaseOptions,
  OnboardOptions as CoreOnboardOptions,
} from "starkzap";

type CoreCartridgeOnboardOptions = Extract<
  CoreOnboardOptions,
  { strategy: "cartridge" }
>;

type CoreNonCartridgeOnboardOptions = Exclude<
  CoreOnboardOptions,
  CoreCartridgeOnboardOptions
>;

export interface NativeOnboardCartridgeConfig {
  redirectUrl?: string;
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

export type ConnectCartridgeOptions = NativeOnboardCartridgeConfig &
  ConnectCartridgeBaseOptions;
