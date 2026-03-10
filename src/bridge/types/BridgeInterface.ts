import { Amount } from "@/types";
import type { WalletInterface } from "@/wallet";
import type { Address } from "starkzap";

export interface BridgeInterface<
  ExternalAddress = unknown,
  TxResponse = unknown,
  Fee = unknown,
> {
  readonly starknetWallet: WalletInterface;

  deposit(recipient: Address, amount: Amount): Promise<TxResponse>;

  getDepositFeeEstimate(): Promise<Fee>;

  getAvailableDepositBalance(account: ExternalAddress): Promise<Amount>;

  getAllowance(): Promise<Amount | null>;
}
