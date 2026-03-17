import { assertNonEmptyString, describeValue } from "@/connect/utils";
import { ExternalChain, type SolanaAddress } from "@/types";
import type { ChainId } from "@/types";
import type { SolanaProvider } from "@/bridge/solana/types";
import { loadSolanaWeb3 } from "@/connect/solanaWeb3Runtime";
import { fromSolanaAddress } from "@/types/solanaAddress";

export type { SolanaProvider } from "@/bridge/solana/types";

export interface ConnectSolanaWalletOptions {
  chain: ExternalChain.SOLANA;
  provider: SolanaProvider;
  address: string;
  chainId: string;
}

export enum SolanaNetwork {
  MAINNET = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  TESTNET = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
}

function assertSolanaProvider(signer: unknown): SolanaProvider {
  if (
    typeof signer === "object" &&
    signer !== null &&
    "signAndSendTransaction" in signer &&
    typeof signer.signAndSendTransaction === "function"
  ) {
    return signer as SolanaProvider;
  }

  throw new Error(
    `Solana signer must implement signAndSendTransaction(). Received ${describeValue(signer)}.`
  );
}

export class ConnectedSolanaWallet {
  readonly chain = ExternalChain.SOLANA;

  private constructor(
    readonly address: SolanaAddress,
    readonly provider: SolanaProvider,
    readonly network: SolanaNetwork
  ) {}

  public static async from(
    options: ConnectSolanaWalletOptions,
    starknetChain: ChainId
  ): Promise<ConnectedSolanaWallet> {
    const solanaWeb3 = await loadSolanaWeb3("ConnectedSolanaWallet.from");
    const chainId = assertNonEmptyString(options.chainId, "chainId");
    const signer = assertSolanaProvider(options.provider);
    const address = fromSolanaAddress(options.address, solanaWeb3);

    let network: SolanaNetwork;
    if (chainId === SolanaNetwork.MAINNET) {
      network = SolanaNetwork.MAINNET;
    } else if (chainId === SolanaNetwork.TESTNET) {
      network = SolanaNetwork.TESTNET;
    } else {
      throw new Error(`Unsupported chainId ${chainId} for Solana`);
    }

    if (network === SolanaNetwork.MAINNET && !starknetChain.isMainnet()) {
      throw new Error("Solana Mainnet cannot be used with Starknet Sepolia.");
    }

    if (network === SolanaNetwork.TESTNET && !starknetChain.isSepolia()) {
      throw new Error("Solana Testnet cannot be used with Starknet Mainnet.");
    }

    return new ConnectedSolanaWallet(address, signer, network);
  }
}
