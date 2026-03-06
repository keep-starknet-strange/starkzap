import { BridgeToken } from "@/types/bridge/bridge-token";
import { type ConnectedExternalWallet } from "@/connect";
import type { Amount } from "starkzap";

export interface BridgeOperatorInterface {
  getDepositBalance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<Amount>;

  getAllowance<T extends BridgeToken>(
    token: T,
    externalWallet: ConnectedExternalWallet<T>
  ): Promise<Amount | null>;
}
