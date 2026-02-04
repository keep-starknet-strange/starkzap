// Main SDK
export { StarkSDK } from "@/sdk";

// Wallet
export { Wallet, AccountProvider } from "@/wallet";
export type { WalletInterface, WalletOptions } from "@/wallet";
export { CartridgeWallet } from "@/wallet/cartridge";
export type { CartridgeWalletOptions } from "@/wallet/cartridge";

// Transaction
export { Tx } from "@/tx";

// Signer
export type { SignerInterface } from "@/signer/interface";
export { SignerAdapter } from "@/signer/adapter";
export { StarkSigner } from "@/signer/stark";
export { PrivySigner, type PrivySignerConfig } from "@/signer/privy";

// Account Presets
export {
  DevnetPreset,
  OpenZeppelinPreset,
  ArgentPreset,
  BraavosPreset,
  ArgentXV050Preset,
} from "@/account/presets";

// ERC20
export { Erc20 } from "@/erc20";

// Token Presets (auto-generated from AVNU API)
export * from "@/token/presets";
export * from "@/token/presets.sepolia";

// Types - Config
export type {
  SDKConfig,
  ChainId,
  ExplorerConfig,
  ExplorerProvider,
} from "@/types/config";

// Types - Paymaster (re-exported from starknet.js)
export type {
  PaymasterDetails,
  PaymasterOptions,
  PaymasterTimeBounds,
  PaymasterFeeMode,
} from "@/types/sponsorship";

// Types - Wallet
export type {
  AccountConfig,
  AccountClassConfig,
  FeeMode,
  ConnectWalletOptions,
  DeployMode,
  ProgressStep,
  ProgressEvent,
  EnsureReadyOptions,
  ExecuteOptions,
  PreflightOptions,
  PreflightResult,
} from "@/types/wallet";

// Types - Token
export type { Token } from "@/types/token";

// Amount
export { Amount, tokenAmountToFormatted } from "@/types/amount";
export type { AmountArgs } from "@/types/amount";

// Types - Transaction
export type {
  TxReceipt,
  TxStatusUpdate,
  TxWatchCallback,
  TxUnsubscribe,
  WaitOptions,
} from "@/types/tx";

export { TransactionStatus } from "@/types/tx";

// Re-export useful starknet.js types
export {
  TransactionFinalityStatus,
  TransactionExecutionStatus,
} from "starknet";

export type { Call } from "starknet";
