import type { BigNumberish, RpcProvider } from "starknet";
import type { Address } from "@/types";
import type { Amount } from "@/types/amount";

/**
 * The identity used to address a confidential account as a transfer recipient.
 *
 * For elliptic-curve-based protocols (e.g. Tongo), this is the public key
 * as `{x, y}` coordinates on the curve.
 */
export type ConfidentialRecipient = { x: BigNumberish; y: BigNumberish };

/** Configuration for creating a Confidential instance. */
export interface ConfidentialConfig {
  privateKey: BigNumberish | Uint8Array;
  contractAddress: Address;
  provider: RpcProvider;
}

/** Shared fields for all confidential operations. */
interface ConfidentialDetailsBase {
  /** The Starknet sender address (wallet address executing the tx). */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

export interface ConfidentialFundDetails extends ConfidentialDetailsBase {
  amount: Amount;
}

export interface ConfidentialTransferDetails extends ConfidentialDetailsBase {
  amount: Amount;
  /** Recipient's confidential account identity (provider-specific). */
  to: ConfidentialRecipient;
}

export interface ConfidentialWithdrawDetails extends ConfidentialDetailsBase {
  amount: Amount;
  /** The Starknet address to receive the withdrawn ERC20 tokens. */
  to: Address;
}

export interface ConfidentialRagequitDetails extends ConfidentialDetailsBase {
  /** The Starknet address to receive all funds. */
  to: Address;
}

export interface ConfidentialRolloverDetails {
  sender: Address;
}

/** Decrypted confidential account state. */
export interface ConfidentialState {
  /** Active (spendable) balance. */
  balance: bigint;
  /** Pending balance (needs rollover to become active). */
  pending: bigint;
  /** Account nonce. */
  nonce: bigint;
}
