// Main SDK
export { StarkZap } from "@/sdk";
export type {
  ConnectCartridgeBaseOptions,
  CartridgeWalletInterface,
} from "@/sdk";

// Wallet
export { Wallet, AccountProvider, BaseWallet } from "@/wallet";
export type { WalletInterface, WalletOptions } from "@/wallet";
// Exported for wallet implementations outside this package (e.g. @starkzap/native).
export { preflightFromSimulation } from "@/wallet/utils";
// Exported so starkzap-native validates its Cartridge URLs by the same rule.
export { assertSafeHttpUrl } from "@/utils";
export type { SafeHttpUrlOptions } from "@/utils";

// Transaction
export { Tx, TxBuilder } from "@/tx";

// Signer
export * from "@/signer";

// Account
export * from "@/account";

// Network
export * from "@/network";

// ERC20
export * from "@/erc20";

// Staking
export * from "@/staking";

// Swap
export * from "@/swap";

// Confidential
export * from "@/confidential";

// Privacy (STRK20 privacy pool)
// Privacy lives at `starkzap/privacy`. Its types name the optional privacy
// SDK, so they are not re-exported here.

// Lending
export * from "@/lending";

// DCA
export * from "@/dca";

// Bridge
export * from "@/bridge";

// Connect
export * from "@/connect";

// Troves
export * from "@/troves";

// Logger
export type { Logger, LoggerConfig, LogLevel } from "@/logger";

// Types
export * from "@/types";

// Re-export useful starknet.js types and classes for apps that need read-only contract calls
export {
  Contract,
  TransactionFinalityStatus,
  TransactionExecutionStatus,
} from "starknet";

export type {
  Call,
  PreparedTransaction,
  ExecutableUserTransaction,
  RpcProvider,
} from "starknet";
