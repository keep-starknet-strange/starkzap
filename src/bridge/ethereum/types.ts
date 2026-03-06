import {
  type Contract,
  type PreparedTransactionRequest,
  type Provider,
  type Signer,
} from "ethers";
import { type EthereumAddress, fromEthereumAddress } from "@/types";

export type EthereumWalletConfig = {
  signer: Signer;
  provider: Provider;
};

export type EthereumTransactionDetails = {
  method: string;
  args: string[];
  transaction: PreparedTransactionRequest;
};

export async function ethereumAddress(
  contract: Contract
): Promise<EthereumAddress> {
  const target = contract.target;

  if (typeof target === "string") {
    return fromEthereumAddress(target);
  } else {
    const address = await target.getAddress();
    return fromEthereumAddress(address);
  }
}
