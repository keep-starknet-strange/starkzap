import { BridgeToken } from "@/types/bridge/bridge-token";
import { type ConnectedExternalWallet } from "@/connect";
import type { Amount } from "starkzap";
import type { FeeEstimation, TxResponseFor } from "@/bridge/types/generics";
import type { Address } from "@/types";

export interface BridgeOperatorInterface {
  deposit<T extends BridgeToken>(
    recipient: Address,
    amount: Amount,
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<TxResponseFor<T>>;

  getDepositBalance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<Amount>;

  getDepositFeeEstimate<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<FeeEstimation<T>>;

  getAllowance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<Amount | null>;
}
