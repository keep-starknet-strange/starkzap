import { describeValue } from "@/connect/utils";
import {
  type EthereumAddress,
  ExternalChain,
  fromEthereumAddress,
} from "@/types";
import type { EthereumWalletConfig } from "@/bridge";
import { BrowserProvider } from "ethers";
import type { ChainId } from "@/types";

function assertEip1193Provider(provider: unknown): Eip1193Provider {
  if (
    typeof provider === "object" &&
    provider !== null &&
    "request" in provider &&
    typeof provider.request === "function"
  ) {
    return provider as Eip1193Provider;
  }

  throw new Error(
    `EVM provider must implement EIP-1193 request(). Received ${describeValue(provider)}.`
  );
}

export interface Eip1193Provider {
  request<T = unknown>(
    args: {
      method: string;
      params?: unknown[] | Record<string, unknown> | object | undefined;
    },
    chain?: string | undefined,
    expiry?: number | undefined
  ): Promise<T>;
}

export interface ConnectEthereumWalletOptions {
  chain: ExternalChain.ETHEREUM;
  provider: Eip1193Provider;
  address: EthereumAddress;
  chainId: string | number;
}

export enum EthereumNetwork {
  MAINNET = 1,
  SEPOLIA = 11155111,
}

export class ConnectedEthereumWallet {
  readonly chain = ExternalChain.ETHEREUM;

  private constructor(
    readonly address: EthereumAddress,
    readonly provider: Eip1193Provider,
    readonly network: EthereumNetwork
  ) {}

  public async toEthWalletConfig(): Promise<EthereumWalletConfig> {
    // Safeguard check. The provider
    const ethChainIdRaw = await this.provider.request<string>({
      method: "eth_chainId",
    });
    const ethChainId = Number(BigInt(ethChainIdRaw));
    const networkId: number = this.network;

    if (ethChainId !== networkId) {
      throw new Error(
        `Cannot create Ethereum Bridge. Expected ethereum chain id to be ${networkId} but got ${ethChainId}.`
      );
    }

    const provider = new BrowserProvider(this.provider, networkId);
    const signer = await provider.getSigner(this.address);
    return { provider, signer };
  }

  public static from(
    options: ConnectEthereumWalletOptions,
    starknetChain: ChainId
  ): ConnectedEthereumWallet {
    const address = fromEthereumAddress(options.address);
    const provider = assertEip1193Provider(options.provider);

    const numericChainId =
      typeof options.chainId === "string"
        ? Number(options.chainId)
        : options.chainId;

    if (!Number.isFinite(numericChainId) || numericChainId <= 0) {
      throw new Error(`Invalid EVM chain ID: ${String(options.chainId)}`);
    }

    let network: EthereumNetwork;
    if (numericChainId === EthereumNetwork.MAINNET) {
      network = EthereumNetwork.MAINNET;
    } else if (numericChainId === EthereumNetwork.SEPOLIA) {
      network = EthereumNetwork.SEPOLIA;
    } else {
      throw new Error(`Unsupported chainId ${numericChainId} for Solana`);
    }

    if (network === EthereumNetwork.MAINNET && !starknetChain.isMainnet()) {
      throw new Error(`EVM chain id expected to be mainnet.`);
    }

    if (network === EthereumNetwork.SEPOLIA && !starknetChain.isSepolia()) {
      throw new Error("EVM chain id expected to be sepolia.");
    }

    return new ConnectedEthereumWallet(address, provider, network);
  }
}
