import {
  BridgeToken,
  type EthereumAddress,
  EthereumBridgeToken,
  SolanaBridgeToken,
} from "@/types";
import type { TransactionResponse } from "ethers";
import type { ConnectedEthereumWallet, ConnectedSolanaWallet } from "@/connect";
import type { EthereumDepositFeeEstimation } from "@/bridge";
import type { SolanaDepositFeeEstimation } from "@/bridge/solana/types";

interface BridgeTokenRegistry {
  ethereum: {
    token: EthereumBridgeToken;
    address: EthereumAddress;
    txResponse: TransactionResponse;
    wallet: ConnectedEthereumWallet;
    feeEstimation: EthereumDepositFeeEstimation;
  };
  solana: {
    token: SolanaBridgeToken;
    address: string;
    txResponse: string;
    wallet: ConnectedSolanaWallet;
    feeEstimation: SolanaDepositFeeEstimation;
  };
}

type EntryFor<T extends BridgeToken> = {
  [K in keyof BridgeTokenRegistry]: T extends BridgeTokenRegistry[K]["token"]
    ? BridgeTokenRegistry[K]
    : never;
}[keyof BridgeTokenRegistry];

export type AddressFor<T extends BridgeToken> = EntryFor<T>["address"];
export type TxResponseFor<T extends BridgeToken> = EntryFor<T>["txResponse"];
export type FeeEstimation<T extends BridgeToken> = EntryFor<T>["feeEstimation"];

export function isTokenForChain<C extends keyof BridgeTokenRegistry>(
  token: BridgeToken,
  chain: C
): token is BridgeTokenRegistry[C]["token"] {
  return token.chain === chain;
}
