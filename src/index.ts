// Main SDK (StarkZap is the public name; StarkSDK kept for backward compatibility)
export { StarkSDK } from "@/sdk";
export { StarkSDK as StarkZap } from "@/sdk";

// Wallet
export { Wallet, AccountProvider, BaseWallet } from "@/wallet";
export type { WalletInterface, WalletOptions } from "@/wallet";

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
