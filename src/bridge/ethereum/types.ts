import {
  type Contract,
  type PreparedTransactionRequest,
  type Provider,
  type Signer,
} from "ethers";
import { type EthereumAddress, fromEthereumAddress } from "@/types";
import type { FeeErrorCause } from "@/types/errors";
import type { Amount } from "starkzap";

export type EthereumWalletConfig = {
  signer: Signer;
  provider: Provider;
};

export type EthereumTransactionDetails = {
  method: string;
  args: string[];
  transaction: PreparedTransactionRequest;
};

export type SnFeeUnit = "eth" | "strk";

export type ApprovalFeeEstimation = {
  approvalFee: Amount;
  approvalFeeError?: FeeErrorCause | undefined;
};

export type EthereumDepositFeeEstimation = ApprovalFeeEstimation & {
  l1Fee: Amount;
  l2Fee: Amount;
  l1FeeError?: FeeErrorCause | undefined;
  l2FeeError?: FeeErrorCause | undefined;
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
