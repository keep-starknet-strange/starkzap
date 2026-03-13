import { BridgeToken } from "@/types/bridge/bridge-token";
import { type ConnectedExternalWallet } from "@/connect";
import type {
  Address,
  Amount,
  BridgeDepositFeeEstimation,
  ExternalTransactionResponse,
} from "@/types";
import type { BridgeDepositOptions } from "@/bridge/types/BridgeInterface";

export interface BridgeOperatorInterface {
  deposit(
    recipient: Address,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse>;

  getDepositBalance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount>;

  getDepositFeeEstimate(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation>;

  getAllowance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount | null>;
}
