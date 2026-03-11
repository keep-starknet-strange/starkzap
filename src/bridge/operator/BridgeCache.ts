import type { BridgeInterface } from "@/bridge/types/BridgeInterface";
import { BridgeToken } from "@/types";
import type {
  AddressFor,
  FeeEstimationFor,
  TxResponseFor,
} from "@/bridge/types/generics";
import type { ConnectedExternalWallet } from "@/connect";

export class BridgeCache {
  private readonly cache = new Map<
    string,
    {
      wallet: ConnectedExternalWallet<string>;
      bridge: Promise<unknown>;
    }
  >();

  public get<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<AddressFor<T>>
  ):
    | Promise<
        BridgeInterface<AddressFor<T>, TxResponseFor<T>, FeeEstimationFor<T>>
      >
    | undefined {
    const key = this.key(token, wallet);
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.wallet !== wallet) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.bridge as Promise<
      BridgeInterface<AddressFor<T>, TxResponseFor<T>, FeeEstimationFor<T>>
    >;
  }

  public set<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<AddressFor<T>>,
    bridge: Promise<
      BridgeInterface<AddressFor<T>, TxResponseFor<T>, FeeEstimationFor<T>>
    >
  ): void {
    const key = this.key(token, wallet);

    this.cache.set(key, { wallet, bridge });
  }

  private key<T extends BridgeToken>(
    token: T,
    wallet: ConnectedExternalWallet<AddressFor<T>>
  ): string {
    return `${wallet.chainId}:${wallet.address}:${token.address}`;
  }
}
