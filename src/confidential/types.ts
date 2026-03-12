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
  /** The Tongo private key (separate from the Starknet wallet key). */
  privateKey: BigNumberish | Uint8Array;
  /** The Tongo contract address on Starknet. */
  contractAddress: Address;
  /** An RPC provider for on-chain reads. */
  provider: RpcProvider;
}

/** Details for funding a confidential account. */
export interface ConfidentialFundDetails {
  /** Amount to fund. */
  amount: Amount;
  /** The Starknet sender address (wallet address executing the tx). */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

/** Details for a confidential transfer. */
export interface ConfidentialTransferDetails {
  /** Amount to transfer. */
  amount: Amount;
  /** Recipient's confidential account identity (provider-specific). */
  to: ConfidentialRecipient;
  /** The Starknet sender address. */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

/** Details for withdrawing from a confidential account. */
export interface ConfidentialWithdrawDetails {
  /** Amount to withdraw. */
  amount: Amount;
  /** The Starknet address to receive the withdrawn ERC20 tokens. */
  to: Address;
  /** The Starknet sender address. */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

/** Details for an emergency ragequit (full withdrawal). */
export interface ConfidentialRagequitDetails {
  /** The Starknet address to receive all funds. */
  to: Address;
  /** The Starknet sender address. */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

/** Details for a rollover (activate pending balance). */
export interface ConfidentialRolloverDetails {
  /** The Starknet sender address. */
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
