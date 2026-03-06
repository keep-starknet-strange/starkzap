import { assertNonEmptyString, describeValue } from "@/connect/utils";
import { ExternalChain, SolanaBridgeToken } from "@/types";
import type { ConnectedExternalWallet } from "@/connect/index";
import type { ChainId } from "starkzap";

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
  address: string;
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

export class ConnectedSolanaWallet implements ConnectedExternalWallet<SolanaBridgeToken> {
  readonly chain = ExternalChain.SOLANA;

  private constructor(
    readonly address: string,
    readonly chainId: string,
    readonly provider: SolanaProvider
  ) {}

  public static from(
    options: ConnectSolanaWalletOptions,
    starknetChain: ChainId
  ): ConnectedSolanaWallet {
    const address = assertNonEmptyString(options.address, "address");
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

    return new ConnectedSolanaWallet(address, chainId, provider);
  }
}
