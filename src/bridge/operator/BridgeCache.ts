import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { BridgeToken } from "@/types";

export class BridgeCache {
  private readonly cache = new Map<string, unknown>();

  public get<T extends BridgeToken>(
    key: string
  ): BridgeInterface<T> | undefined {
    if (!this.cache.has(key)) return undefined;
    return this.cache.get(key) as BridgeInterface<T>;
  }

  public set<T extends BridgeToken>(
    key: string,
    bridge: BridgeInterface<T>
  ): void {
    this.cache.set(key, bridge);
  }

  public clear(): void {
    this.cache.clear();
  }
}
