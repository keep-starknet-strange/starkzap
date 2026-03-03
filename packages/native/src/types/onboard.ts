import type {
  FeeMode,
  OnboardOptions as CoreOnboardOptions,
} from "starkzap";
import type { PaymasterTimeBounds } from "starknet";

type CoreCartridgeOnboardOptions = Extract<
  CoreOnboardOptions,
  { strategy: "cartridge" }
>;

type CoreNonCartridgeOnboardOptions = Exclude<
  CoreOnboardOptions,
  CoreCartridgeOnboardOptions
>;

type CoreCartridgeConfig = NonNullable<CoreCartridgeOnboardOptions["cartridge"]>;

export interface NativeOnboardCartridgeConfig extends CoreCartridgeConfig {
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
