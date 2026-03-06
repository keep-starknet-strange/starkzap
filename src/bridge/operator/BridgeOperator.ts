import { BridgeCache } from "@/bridge/operator/BridgeCache";
import { BridgeToken, EthereumBridgeToken } from "@/types/bridge/bridge-token";
import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { CanonicalEthereumBridge } from "@/bridge/ethereum/CanonicalEthereumBridge";
import { Protocol } from "@/types/bridge/protocol";
import { isTokenForChain } from "@/bridge/types/generics";
import {
  ConnectedEthereumWallet,
  type ConnectedExternalWallet,
} from "@/connect";

export class BridgeOperator {
  private cache = new BridgeCache();

  public async getDepositBalance<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<T>
  ) {
    const bridge = await this.bridge(token, wallet);
    return bridge.getAvailableDepositBalance(wallet.address);
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private async bridge<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<T>
  ): Promise<BridgeInterface<T>> {
    const key = `${token.id}:${wallet.address}`;

    const cached = this.cache.get<T>(key);
    if (cached) return cached;

    const bridge = await this.createBridge(token, wallet);
    this.cache.set(key, bridge);
    return bridge;
  }

  private async createBridge<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<T>
  ): Promise<BridgeInterface<T>> {
    if (isTokenForChain(token, "ethereum")) {
      return (await this.createEthereumBridge(
        token,
        wallet as ConnectedEthereumWallet
      )) as unknown as BridgeInterface<T>;
    }

    throw new Error(`Unsupported chain "${token.chain}".`);
  }

  private async createEthereumBridge(
    token: EthereumBridgeToken,
    wallet: ConnectedEthereumWallet
  ): Promise<BridgeInterface<EthereumBridgeToken>> {
    const walletConfig = await wallet.toEthWalletConfig();

    switch (token.protocol) {
      case Protocol.CANONICAL:
        return new CanonicalEthereumBridge(token, walletConfig);
      default:
        throw new Error(`Unsupported protocol "${token.protocol}".`);
    }
  }
}
