import type { BigNumberish, RpcProvider } from "starknet";
import type { Address } from "@/types";

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
  /** Amount to fund (in tongo units). */
  amount: bigint;
  /** The Starknet sender address (wallet address executing the tx). */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

/** Details for a confidential transfer. */
export interface ConfidentialTransferDetails {
  /** Amount to transfer (in tongo units). */
  amount: bigint;
  /** Recipient's Tongo public key (as {x, y} coordinates). */
  to: { x: BigNumberish; y: BigNumberish };
  /** The Starknet sender address. */
  sender: Address;
  /** Optional fee paid to sender (for relayed txs). */
  feeTo?: bigint;
}

/** Details for withdrawing from a confidential account. */
export interface ConfidentialWithdrawDetails {
  /** Amount to withdraw (in tongo units). */
  amount: bigint;
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
