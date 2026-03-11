import { describeValue, normalizeChainId } from "@/connect/utils";
import {
  type EthereumAddress,
  ExternalChain,
  fromEthereumAddress,
} from "@/types";
import type { ConnectedExternalWallet } from "@/connect/index";
import type { EthereumWalletConfig } from "@/bridge";
import { BrowserProvider } from "ethers";
import type { ChainId } from "starkzap";

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

export class ConnectedEthereumWallet implements ConnectedExternalWallet<EthereumAddress> {
  readonly chain = ExternalChain.ETHEREUM;

  private constructor(
    readonly address: EthereumAddress,
    readonly chainId: number,
    readonly provider: Eip1193Provider
  ) {}

  public async toEthWalletConfig(): Promise<EthereumWalletConfig> {
    const ethChainIdRaw = await this.provider.request<string>({
      method: "eth_chainId",
    });
    const ethChainId = Number(BigInt(ethChainIdRaw));

    if (ethChainId !== this.chainId) {
      throw new Error(
        `Cannot create Ethereum Bridge. Expected ethereum chain id to be ${this.chainId} but got ${ethChainId}.`
      );
    }

    const provider = new BrowserProvider(this.provider, this.chainId);
    const signer = await provider.getSigner(this.address);
    return { provider, signer };
  }

  public static from(
    options: ConnectEthereumWalletOptions,
    starknetChain: ChainId
  ): ConnectedEthereumWallet {
    const address = fromEthereumAddress(options.address);
    const chainId = normalizeChainId(starknetChain, options.chainId);
    const provider = assertEip1193Provider(options.provider);

    return new ConnectedEthereumWallet(address, chainId, provider);
  }
}
