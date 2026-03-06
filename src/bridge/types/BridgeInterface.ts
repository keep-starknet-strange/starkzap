import { type Address, Amount, BridgeToken } from "@/types";
import type { AddressFor, TxResponseFor } from "@/bridge/types/generics";
import type { WalletInterface } from "@/wallet";

export interface BridgeInterface<T extends BridgeToken> {
  readonly starknetWallet: WalletInterface;

  deposit(recipient: Address, amount: Amount): Promise<TxResponseFor<T>>;

  getAvailableDepositBalance(account: AddressFor<T>): Promise<Amount>;

  getAllowance(): Promise<Amount | null>;
}
