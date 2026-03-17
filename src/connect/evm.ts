import { describeValue } from "@/connect/utils";
import { type EthereumAddress, ExternalChain } from "@/types";
import type { EthereumWalletConfig } from "@/bridge";
import type { ChainId } from "@/types";
import { loadEthers } from "@/connect/ethersRuntime";
import { fromEthereumAddress } from "@/connect/ethersRuntime";

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
  request<T = unknown>(args: {
    method: string;
    params?: unknown[] | Record<string, unknown> | object | undefined;
  }): Promise<T>;
}

export interface ConnectEthereumWalletOptions {
  chain: ExternalChain.ETHEREUM;
  provider: Eip1193Provider;
  address: string;
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

  public async toEthWalletConfig(
    ethereumRpcUrl?: string | undefined
  ): Promise<EthereumWalletConfig> {
    const ethers = await loadEthers(
      "ConnectedEthereumWallet.toEthWalletConfig"
    );
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

    const browserProvider = new ethers.BrowserProvider(
      this.provider,
      networkId
    );
    const signer = await browserProvider.getSigner(this.address);

    let provider;
    if (ethereumRpcUrl) {
      const rpcProvider = new ethers.JsonRpcProvider(ethereumRpcUrl, networkId);
      const rpcNetwork = await rpcProvider.getNetwork();
      const rpcChainId = Number(rpcNetwork.chainId);

      if (rpcChainId !== networkId) {
        throw new Error(
          `Custom Ethereum RPC URL is on chain ${rpcChainId} but the connected wallet is on chain ${networkId}.`
        );
      }
      provider = rpcProvider;
    } else {
      provider = browserProvider;
    }

    return { provider, signer };
  }

  public static async from(
    options: ConnectEthereumWalletOptions,
    starknetChain: ChainId
  ): Promise<ConnectedEthereumWallet> {
    const ethers = await loadEthers("ConnectedEthereumWallet.from");
    const address = fromEthereumAddress(options.address, ethers);
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
      throw new Error(`Unsupported chainId ${numericChainId} for Ethereum`);
    }

    if (network === EthereumNetwork.MAINNET && !starknetChain.isMainnet()) {
      throw new Error(`Ethereum Mainnet cannot be used with Starknet Sepolia.`);
    }

    if (network === EthereumNetwork.SEPOLIA && !starknetChain.isSepolia()) {
      throw new Error("Ethereum Sepolia cannot be used with Starknet Mainnet.");
    }

    return new ConnectedEthereumWallet(address, provider, network);
  }
}
