// Main SDK
export { StarkSDK } from "./sdk.js";

// Wallet
export { Wallet, type WalletInterface } from "./wallet/index.js";
export { CartridgeWallet } from "./wallet/cartridge.js";
export type { CartridgeWalletOptions } from "./wallet/cartridge.js";

// Transaction
export { Tx } from "./tx/index.js";

// Signer
export type { SignerInterface } from "./signer/interface.js";
export { StarkSigner } from "./signer/stark.js";

// Account Presets
export {
  DevnetPreset,
  OpenZeppelinPreset,
  ArgentPreset,
  BraavosPreset,
} from "./account/presets.js";

// Token Presets (auto-generated from Voyager API)
export * from "./token/presets.js";
export * from "./token/presets.sepolia.js";

// Types - Config
export type {
  SDKConfig,
  ChainId,
  ExplorerConfig,
  ExplorerProvider,
} from "./types/config.js";

// Types - Paymaster (re-exported from starknet.js)
export type {
  PaymasterDetails,
  PaymasterOptions,
  PaymasterTimeBounds,
  PaymasterFeeMode,
} from "./types/sponsorship.js";

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
  DeployOptions,
  ExecuteOptions,
  PrepareOptions,
  PreflightKind,
  PreflightOptions,
  PreflightResult,
} from "./types/wallet.js";

// Re-export paymaster transaction types from starknet.js
export type { PreparedTransaction, ExecutableUserTransaction } from "starknet";

// Types - Token
export type { Token } from "./types/token.js";

// Amount
export { Amount, tokenAmountToFormatted } from "./types/amount.js";
export type { AmountInput, AmountArgs } from "./types/amount.js";

// Types - Transaction
export type {
  TxReceipt,
  TxStatusUpdate,
  TxWatchCallback,
  TxUnsubscribe,
  WaitOptions,
} from "./types/tx.js";

export { TransactionStatus } from "./types/tx.js";

// Re-export useful starknet.js types
export {
  TransactionFinalityStatus,
  TransactionExecutionStatus,
} from "starknet";

export type { Call } from "starknet";
