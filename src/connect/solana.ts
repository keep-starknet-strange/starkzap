import { assertNonEmptyString, describeValue } from "@/connect/utils";
import { ExternalChain, type SolanaAddress } from "@/types";
import type { ConnectedExternalWallet } from "@/connect/index";
import type { ChainId } from "starkzap";
import type { SolanaWalletConfig } from "@/bridge/solana/types";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const SOLANA_MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

export interface SolanaProvider {
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signAndSendTransaction(
    transaction: object,
    signers?: object[]
  ): Promise<{ signature: string }>;
}

export interface ConnectSolanaWalletOptions {
  chain: ExternalChain.SOLANA;
  provider: SolanaProvider;
  address: SolanaAddress;
  chainId: string;
}

function assertSolanaProvider(provider: unknown): SolanaProvider {
  if (
    typeof provider === "object" &&
    provider !== null &&
    "signMessage" in provider &&
    typeof provider.signMessage === "function" &&
    "signAndSendTransaction" in provider &&
    typeof provider.signAndSendTransaction === "function"
  ) {
    return provider as SolanaProvider;
  }

  throw new Error(
    `Solana provider must implement signMessage() and signAndSendTransaction(). Received ${describeValue(provider)}.`
  );
}

export class ConnectedSolanaWallet implements ConnectedExternalWallet<SolanaAddress> {
  readonly chain = ExternalChain.SOLANA;

  private constructor(
    readonly address: SolanaAddress,
    readonly chainId: string,
    readonly provider: SolanaProvider
  ) {}

  public toSolanaWalletConfig(rpcUrl?: string): SolanaWalletConfig {
    const cluster =
      this.chainId === SOLANA_MAINNET_GENESIS ? "mainnet-beta" : "devnet";
    const endpoint = rpcUrl ?? clusterApiUrl(cluster);
    const connection = new Connection(endpoint);
    return { signer: this.provider, connection };
  }

  public static from(
    options: ConnectSolanaWalletOptions,
    starknetChain: ChainId
  ): ConnectedSolanaWallet {
    const chainId = assertNonEmptyString(options.chainId, "chainId");
    const provider = assertSolanaProvider(options.provider);

    if (chainId === SOLANA_MAINNET_GENESIS && !starknetChain.isMainnet()) {
      throw new Error("Solana mainnet cannot be used with Starknet testnet.");
    }

    if (chainId === SOLANA_DEVNET_GENESIS && !starknetChain.isSepolia()) {
      throw new Error("Solana devnet cannot be used with Starknet mainnet.");
    }

    if (
      chainId !== SOLANA_MAINNET_GENESIS &&
      chainId !== SOLANA_DEVNET_GENESIS
    ) {
      throw new Error("Can connect only mainnet or devnet on solana");
    }

    return new ConnectedSolanaWallet(options.address, chainId, provider);
  }
}
