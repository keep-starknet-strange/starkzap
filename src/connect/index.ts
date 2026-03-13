import {
  ConnectedEthereumWallet,
  type ConnectEthereumWalletOptions,
} from "@/connect/evm";
import {
  ConnectedSolanaWallet,
  type ConnectSolanaWalletOptions,
} from "@/connect/solana";

export * from "@/connect/evm";
export * from "@/connect/solana";

export type ConnectExternalWalletOptions =
  | ConnectEthereumWalletOptions
  | ConnectSolanaWalletOptions;

export type ConnectedExternalWallet =
  | ConnectedEthereumWallet
  | ConnectedSolanaWallet;
