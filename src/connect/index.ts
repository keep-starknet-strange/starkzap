import { BridgeToken, ExternalChain } from "@/types";
import type { ConnectedEthereumWallet } from "@/connect/evm";
import type { ConnectedSolanaWallet } from "@/connect/solana";
import type { ConnectEthereumWalletOptions } from "@/connect/evm";
import type { ConnectSolanaWalletOptions } from "@/connect/solana";
import type { AddressFor } from "@/bridge/types/generics";

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

export interface ConnectedExternalWallet<T extends BridgeToken> {
  readonly chain: ExternalChain;
  readonly address: AddressFor<T>;
}
