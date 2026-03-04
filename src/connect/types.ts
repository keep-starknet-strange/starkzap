import { ExternalChain } from "@/types";

interface ConnectedWalletInterface<TChain extends ExternalChain, TTransaction> {
  readonly chain: TChain;
  readonly address: string;
  readonly chainId: string;
  signMessage(message: string | Uint8Array): Promise<string>;
  sendTransaction(tx: TTransaction): Promise<string>;
  getRawProvider(): unknown;
}

export interface EvmTransactionRequest {
  readonly to?: string;
  readonly from?: string;
  readonly value?: string;
  readonly data?: string;
  readonly gas?: string;
  readonly gasPrice?: string;
  readonly maxFeePerGas?: string;
  readonly maxPriorityFeePerGas?: string;
  readonly nonce?: string;
  readonly type?: string;
  readonly chainId?: string;
  readonly [key: string]: unknown;
}

export interface SolanaTransactionRequest {
  readonly transaction: object;
  readonly options?: Record<string, unknown>;
}

export type SolanaTransactionInput = object | SolanaTransactionRequest;

export type EvmConnectedWallet = ConnectedWalletInterface<
  ExternalChain.ETHEREUM,
  EvmTransactionRequest
>;

export type SolanaConnectedWallet = ConnectedWalletInterface<
  ExternalChain.SOLANA,
  SolanaTransactionInput
>;

export type ConnectedWallet = EvmConnectedWallet | SolanaConnectedWallet;
