import { type Address, Amount } from "@/types";

export interface BridgeInterface<TL1Address, TTransactionResponse> {
  deposit(amount: Amount, l2Recipient: Address): Promise<TTransactionResponse>;

  getAvailableDepositBalance(account: TL1Address): Promise<Amount>;

  getAllowance(): Promise<Amount | null>;
}
