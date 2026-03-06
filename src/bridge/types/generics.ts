import {
  BridgeToken,
  type EthereumAddress,
  EthereumBridgeToken,
  SolanaBridgeToken,
} from "@/types";
import type { TransactionResponse } from "ethers";
import type { ConnectedEthereumWallet, ConnectedSolanaWallet } from "@/connect";

interface BridgeTokenRegistry {
  ethereum: {
    token: EthereumBridgeToken;
    address: EthereumAddress;
    txResponse: TransactionResponse;
    wallet: ConnectedEthereumWallet;
  };
  solana: {
    token: SolanaBridgeToken;
    address: string;
    txResponse: string;
    wallet: ConnectedSolanaWallet;
  };
}

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
