import {
  EthereumBridgeToken,
  type EthereumAddress,
  SolanaBridgeToken,
  BridgeToken,
} from "@/types";
import type { TransactionResponse } from "ethers";
import type { BridgeInterface } from "@/bridge/BridgeInterface";

interface BridgeTokenRegistry {
  ethereum: {
    token: EthereumBridgeToken;
    address: EthereumAddress;
    txResponse: TransactionResponse;
  };
  solana: {
    token: SolanaBridgeToken;
    address: string;
    txResponse: string;
  };
}

// Extract types from any BridgeToken via the registry
type EntryFor<T extends BridgeToken> = {
  [K in keyof BridgeTokenRegistry]: T extends BridgeTokenRegistry[K]["token"]
    ? BridgeTokenRegistry[K]
    : never;
}[keyof BridgeTokenRegistry];

export type AddressFor<T extends BridgeToken> = EntryFor<T>["address"];
export type TxResponseFor<T extends BridgeToken> = EntryFor<T>["txResponse"];

export function isTokenForChain<C extends keyof BridgeTokenRegistry>(
  token: BridgeToken,
  chain: C
): token is BridgeTokenRegistry[C]["token"] {
  return token.chain === chain;
}

export class BridgeCache {
  private readonly cache = new Map<string, BridgeInterface<unknown, unknown>>();

  private set<T extends BridgeToken>(
    token: T,
    bridge: BridgeInterface<AddressFor<T>, TxResponseFor<T>>
  ): void {
    this.cache.set(token.id, bridge);
  }

  private get<T extends BridgeToken>(
    token: T
  ): BridgeInterface<AddressFor<T>, TxResponseFor<T>> | undefined {
    return this.cache.get(token.id) as
      | BridgeInterface<AddressFor<T>, TxResponseFor<T>>
      | undefined;
  }

  public getOrCreate<T extends BridgeToken>(
    token: T,
    create: () => BridgeInterface<string, unknown>
  ): BridgeInterface<AddressFor<T>, TxResponseFor<T>> {
    const cached = this.get(token);
    if (cached) return cached;

    const bridge = create();
    this.cache.set(token.id, bridge);
    return bridge as BridgeInterface<AddressFor<T>, TxResponseFor<T>>;
  }
}
