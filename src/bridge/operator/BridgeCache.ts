import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { BridgeToken } from "@/types";
import { type ConnectedExternalWallet } from "@/connect";

const MAX_BRIDGE_CACHE_SIZE = 128;

type BridgeCacheEntry = {
  wallet: ConnectedExternalWallet;
  bridge: Promise<BridgeInterface>;
};

export class BridgeCache {
  private readonly cache = new Map<string, BridgeCacheEntry>();

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

    this.touch(key, entry);
    return entry.bridge;
  }

  public set(
    token: BridgeToken,
    wallet: ConnectedExternalWallet,
    bridge: Promise<BridgeInterface>
  ): void {
    const key = this.key(token, wallet);

    const guarded = bridge.catch((error) => {
      if (this.cache.get(key)?.bridge === guarded) {
        this.cache.delete(key);
      }
      throw error;
    });

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= MAX_BRIDGE_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, { wallet, bridge: guarded });
  }

  public clear() {
    this.cache.clear();
  }

  private evictOldest(): void {
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) {
      this.cache.delete(oldest);
    }
  }

  private touch(key: string, entry: BridgeCacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  private key(token: BridgeToken, wallet: ConnectedExternalWallet): string {
    return [
      wallet.chain,
      wallet.network.toString(),
      wallet.address,
      token.chain,
      token.protocol,
      token.id,
      token.address,
    ].join(":");
  }
}
