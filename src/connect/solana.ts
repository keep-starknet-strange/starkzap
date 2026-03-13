import { assertNonEmptyString, describeValue } from "@/connect/utils";
import { ExternalChain, type SolanaAddress } from "@/types";
import type { ChainId } from "starkzap";
import type { SolanaSigner, SolanaWalletConfig } from "@/bridge/solana/types";
import { clusterApiUrl, Connection } from "@solana/web3.js";

export type { SolanaSigner } from "@/bridge/solana/types";

const SOLANA_MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_TESTNET_GENESIS = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";

export interface ConnectSolanaWalletOptions {
  chain: ExternalChain.SOLANA;
  signer: SolanaSigner;
  address: SolanaAddress;
  chainId: string;
}

function assertSolanaSigner(signer: unknown): SolanaSigner {
  if (
    typeof signer === "object" &&
    signer !== null &&
    "signAndSendTransaction" in signer &&
    typeof signer.signAndSendTransaction === "function"
  ) {
    return signer as SolanaSigner;
  }

  throw new Error(
    `Solana signer must implement signAndSendTransaction(). Received ${describeValue(signer)}.`
  );
}

export class ConnectedSolanaWallet {
  readonly chain = ExternalChain.SOLANA;

  private constructor(
    readonly address: SolanaAddress,
    readonly chainId: string,
    readonly signer: SolanaSigner
  ) {}

  public toSolanaWalletConfig(rpcUrl?: string): SolanaWalletConfig {
    const cluster =
      this.chainId === SOLANA_MAINNET_GENESIS ? "mainnet-beta" : "testnet";
    const endpoint = rpcUrl ?? clusterApiUrl(cluster);
    const connection = new Connection(endpoint);
    return { address: this.address, signer: this.signer, connection };
  }

  public static from(
    options: ConnectSolanaWalletOptions,
    starknetChain: ChainId
  ): ConnectedSolanaWallet {
    const chainId = assertNonEmptyString(options.chainId, "chainId");
    const signer = assertSolanaSigner(options.signer);

    if (chainId === SOLANA_MAINNET_GENESIS && !starknetChain.isMainnet()) {
      throw new Error("Solana mainnet cannot be used with Starknet Sepolia.");
    }

    if (chainId === SOLANA_TESTNET_GENESIS && !starknetChain.isSepolia()) {
      throw new Error("Solana testnet cannot be used with Starknet Mainnet.");
    }

    if (
      chainId !== SOLANA_MAINNET_GENESIS &&
      chainId !== SOLANA_TESTNET_GENESIS
    ) {
      throw new Error("Can connect only mainnet or testnet on Solana.");
    }

    return new ConnectedSolanaWallet(options.address, chainId, signer);
  }
}
