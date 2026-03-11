import { BridgeToken } from "@/types/bridge/bridge-token";
import { type ConnectedExternalWallet } from "@/connect";
import type { Amount } from "starkzap";
import type {
  AddressFor,
  FeeEstimationFor,
  TxResponseFor,
} from "@/bridge/types/generics";
import type { Address } from "@/types";
import type { BridgeDepositOptions } from "@/bridge/types/BridgeInterface";

export interface BridgeOperatorInterface {
  deposit<T extends BridgeToken>(
    recipient: Address,
    amount: Amount,
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>,
    options?: BridgeDepositOptions
  ): Promise<TxResponseFor<T>>;

  getDepositBalance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>
  ): Promise<Amount>;

  getDepositFeeEstimate<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>,
    options?: BridgeDepositOptions
  ): Promise<FeeEstimationFor<T>>;

  getAllowance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<AddressFor<T>>
  ): Promise<Amount | null>;
}
