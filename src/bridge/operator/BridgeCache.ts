import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { BridgeToken } from "@/types";

export class BridgeCache {
  private readonly cache = new Map<string, Promise<unknown>>();

  public get<T extends BridgeToken>(
    key: string
  ): Promise<BridgeInterface<T>> | undefined {
    if (!this.cache.has(key)) return undefined;
    return this.cache.get(key) as Promise<BridgeInterface<T>>;
  }

  public set<T extends BridgeToken>(
    key: string,
    bridge: Promise<BridgeInterface<T>>
  ): void {
    this.cache.set(key, bridge);
  }

  public clear(): void {
    this.cache.clear();
  }
}
