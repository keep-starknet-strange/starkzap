import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { BridgeToken } from "@/types";
import type {
  AddressFor,
  FeeEstimationFor,
  TxResponseFor,
} from "@/bridge/types/generics";

export class BridgeCache {
  private readonly cache = new Map<string, Promise<unknown>>();

  public get<T extends BridgeToken>(
    key: string
  ):
    | Promise<
        BridgeInterface<AddressFor<T>, TxResponseFor<T>, FeeEstimationFor<T>>
      >
    | undefined {
    if (!this.cache.has(key)) return undefined;
    return this.cache.get(key) as Promise<
      BridgeInterface<AddressFor<T>, TxResponseFor<T>, FeeEstimationFor<T>>
    >;
  }

  public set<T extends BridgeToken>(
    key: string,
    bridge: Promise<
      BridgeInterface<AddressFor<T>, TxResponseFor<T>, FeeEstimationFor<T>>
    >
  ): void {
    this.cache.set(key, bridge);
  }

  public clear(): void {
    this.cache.clear();
  }
}
