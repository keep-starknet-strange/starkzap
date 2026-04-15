import type { Protocol } from "@/types/bridge/protocol";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";

/** Caches monitor construction promises per protocol (guarded like `BridgeCache`). */
export class BridgeMonitorCache {
  private readonly cache = new Map<Protocol, Promise<BridgeMonitorInterface>>();

  get(protocol: Protocol): Promise<BridgeMonitorInterface> | undefined {
    return this.cache.get(protocol);
  }

  set(protocol: Protocol, monitor: Promise<BridgeMonitorInterface>): void {
    const guarded = monitor.catch((error) => {
      if (this.cache.get(protocol) === guarded) {
        this.cache.delete(protocol);
      }
      throw error;
    });

    if (this.cache.has(protocol)) {
      this.cache.delete(protocol);
    }

    this.cache.set(protocol, guarded);
  }

  clear(): void {
    this.cache.clear();
  }
}
