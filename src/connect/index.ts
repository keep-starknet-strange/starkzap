import { ExternalChain } from "@/types";
import type {
  ConnectedEthereumWallet,
  ConnectEthereumWalletOptions,
} from "@/connect/evm";
import type {
  ConnectedSolanaWallet,
  ConnectSolanaWalletOptions,
} from "@/connect/solana";

export * from "@/connect/evm";
export * from "@/connect/solana";

export type ConnectExternalWalletOptions =
  | ConnectEthereumWalletOptions
  | ConnectSolanaWalletOptions;

export type WalletForOptions<O extends ConnectExternalWalletOptions> =
  O extends ConnectEthereumWalletOptions
    ? ConnectedEthereumWallet
    : O extends ConnectSolanaWalletOptions
      ? ConnectedSolanaWallet
      : never;

export interface ExternalWalletRegistry {
  [ExternalChain.ETHEREUM]?: ConnectedEthereumWallet;
  [ExternalChain.SOLANA]?: ConnectedSolanaWallet;
}

export interface ConnectedExternalWallet<A extends string> {
  readonly chain: ExternalChain;
  readonly address: A;
  readonly chainId: string | number;
}
