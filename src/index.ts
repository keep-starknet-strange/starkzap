// Main SDK
export { StarkSDK } from "./sdk.js";

// Wallet
export { Wallet } from "./wallet/index.js";

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

// Token Presets
export { TBTC, WBTC, USDC, USDT, ETH, STRK } from "./token/presets.js";

// Types - Config
export type {
  SDKConfig,
  ChainId,
  SponsorConfig,
  ExplorerConfig,
  ExplorerProvider,
} from "./types/config.js";

// Types - Sponsorship
export type {
  SponsorshipRequest,
  SponsorshipResponse,
  SponsorPolicyHint,
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
  PreflightKind,
  PreflightOptions,
  PreflightResult,
} from "./types/wallet.js";

// Types - Token
export type { Token } from "./types/token.js";

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
