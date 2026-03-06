import { type Address, Amount, BridgeToken } from "@/types";
import type { AddressFor, TxResponseFor } from "@/bridge/types/generics";

export interface BridgeInterface<T extends BridgeToken> {
  deposit(amount: Amount, l2Recipient: Address): Promise<TxResponseFor<T>>;

  getAvailableDepositBalance(account: AddressFor<T>): Promise<Amount>;

  getAllowance(): Promise<Amount | null>;
}
