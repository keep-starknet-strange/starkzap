import type { PaymasterTimeBounds } from "starknet";
import type {
  AccountClassConfig,
  AccountConfig,
  DeployMode,
  FeeMode,
  ProgressEvent,
} from "@/types/wallet";
import type { CartridgeWalletOptions } from "@/wallet/cartridge";
import type { WalletInterface } from "@/wallet/interface";
import type { AccountPresetName } from "@/account/presets";

export const OnboardStrategy = {
  Signer: "signer",
  Privy: "privy",
  Cartridge: "cartridge",
  WebAuthn: "webauthn",
} as const;

export type OnboardStrategy =
  (typeof OnboardStrategy)[keyof typeof OnboardStrategy];

export interface OnboardBaseOptions {
  feeMode?: FeeMode;
  timeBounds?: PaymasterTimeBounds;
  deploy?: DeployMode;
  onProgress?: (event: ProgressEvent) => void;
}

export interface OnboardPrivyResolveResult {
  walletId: string;
  publicKey: string;
  serverUrl?: string;
  rawSign?: (walletId: string, messageHash: string) => Promise<string>;
  metadata?: Record<string, unknown>;
}

export interface OnboardSignerOptions extends OnboardBaseOptions {
  strategy: typeof OnboardStrategy.Signer;
  account: AccountConfig;
  accountPreset?: AccountPresetName | AccountClassConfig;
}

export interface OnboardPrivyOptions extends OnboardBaseOptions {
  strategy: typeof OnboardStrategy.Privy;
  privy: {
    resolve: () => Promise<OnboardPrivyResolveResult>;
  };
  accountPreset?: AccountPresetName | AccountClassConfig;
}

export interface OnboardCartridgeOptions extends OnboardBaseOptions {
  strategy: typeof OnboardStrategy.Cartridge;
  cartridge?: Omit<CartridgeWalletOptions, "feeMode" | "timeBounds">;
}

export interface OnboardWebAuthnOptions extends OnboardBaseOptions {
  strategy: typeof OnboardStrategy.WebAuthn;
}

export type OnboardOptions =
  | OnboardSignerOptions
  | OnboardPrivyOptions
  | OnboardCartridgeOptions
  | OnboardWebAuthnOptions;

export interface OnboardResult<
  TWallet extends WalletInterface = WalletInterface,
> {
  wallet: TWallet;
  strategy: OnboardStrategy;
  deployed: boolean;
  metadata?: Record<string, unknown>;
}
