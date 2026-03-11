import { ExternalChain } from "@/types";
import type { ConnectEthereumWalletOptions } from "@/connect/evm";
import type { ConnectSolanaWalletOptions } from "@/connect/solana";

export * from "@/connect/evm";
export * from "@/connect/solana";

export type ConnectExternalWalletOptions =
  | ConnectEthereumWalletOptions
  | ConnectSolanaWalletOptions;

export interface ConnectedExternalWallet<A extends string> {
  readonly chain: ExternalChain;
  readonly address: A;
  readonly chainId: string | number;
}
