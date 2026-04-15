import { describe, expect, it } from "vitest";
import { BridgeMonitorCache } from "@/bridge/operator/BridgeMonitorCache";
import { Protocol } from "@/types/bridge/protocol";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";

describe("BridgeMonitorCache", () => {
  it("evicts failed monitor promises for the same protocol", async () => {
    const cache = new BridgeMonitorCache();
    const failingPromise = Promise.reject(
      new Error("monitor creation failed")
    ) as Promise<BridgeMonitorInterface>;

    cache.set(Protocol.CCTP, failingPromise);

    const cached = cache.get(Protocol.CCTP);
    expect(cached).toBeDefined();
    await expect(cached!).rejects.toThrow("monitor creation failed");
    expect(cache.get(Protocol.CCTP)).toBeUndefined();
  });

  it("does not evict a newer entry when an older promise rejects", async () => {
    const cache = new BridgeMonitorCache();

    let rejectOld: ((reason?: unknown) => void) | undefined;
    const oldPromise = new Promise<BridgeMonitorInterface>((_, reject) => {
      rejectOld = reject;
    });

    cache.set(Protocol.CCTP, oldPromise);
    const oldGuarded = cache.get(Protocol.CCTP);
    expect(oldGuarded).toBeDefined();

    cache.set(
      Protocol.CCTP,
      Promise.resolve({} as unknown as BridgeMonitorInterface)
    );
    const currentGuarded = cache.get(Protocol.CCTP);
    expect(currentGuarded).toBeDefined();

    rejectOld?.(new Error("old failed"));
    await expect(oldGuarded!).rejects.toThrow("old failed");
    expect(cache.get(Protocol.CCTP)).toBe(currentGuarded);
  });
});
