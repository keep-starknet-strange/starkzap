import type { PaymasterTimeBounds } from "starknet";
import type {
  AccountClassConfig,
  AccountConfig,
  DeployMode,
  FeeMode,
  ProgressEvent,
} from "@/types/wallet";
import type { ExplorerConfig } from "@/types/config";
import type { WalletInterface } from "@/wallet/interface";
import type { AccountPresetName } from "@/account/presets";

type PrivySigningHeaders =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

type PrivySigningBody = (
  params: Readonly<{ walletId: string; hash: string }>
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export const OnboardStrategy = {
  Signer: "signer",
  Privy: "privy",
  Cartridge: "cartridge",
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
  headers?: PrivySigningHeaders;
  buildBody?: PrivySigningBody;
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
  cartridge?: OnboardCartridgeConfig;
}

export interface OnboardCartridgeConfig {
  policies?: Array<{ target: string; method: string }>;
  preset?: string;
  url?: string;
  explorer?: ExplorerConfig;
}

export type OnboardOptions =
  | OnboardSignerOptions
  | OnboardPrivyOptions
  | OnboardCartridgeOptions;

export interface OnboardResult<
  TWallet extends WalletInterface = WalletInterface,
> {
  wallet: TWallet;
  strategy: OnboardStrategy;
  deployed: boolean;
  metadata?: Record<string, unknown>;
}
