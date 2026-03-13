import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { BridgeToken } from "@/types";
import { type ConnectedExternalWallet } from "@/connect";

export class BridgeCache {
  private readonly cache = new Map<
    string,
    {
      wallet: ConnectedExternalWallet;
      bridge: Promise<BridgeInterface>;
    }
  >();

  public get(
    token: BridgeToken,
    wallet: ConnectedExternalWallet
  ): Promise<BridgeInterface> | undefined {
    const key = this.key(token, wallet);
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.wallet !== wallet) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.bridge;
  }

  public set(
    token: BridgeToken,
    wallet: ConnectedExternalWallet,
    bridge: Promise<BridgeInterface>
  ): void {
    const key = this.key(token, wallet);

    this.cache.set(key, { wallet, bridge });
  }

  private key(token: BridgeToken, wallet: ConnectedExternalWallet): string {
    return `${wallet.network.toString()}:${wallet.address}:${token.address}`;
  }
}
