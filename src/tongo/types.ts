import type { Address, ChainId } from "@/types";

/**
 * A point on the Stark curve (projective coordinates).
 * Used for public keys and ciphertexts in the Tongo protocol.
 */
export interface ProjectivePoint {
  x: bigint;
  y: bigint;
}

/**
 * ElGamal ciphertext representing an encrypted balance.
 *
 * The Tongo protocol uses ElGamal encryption for confidential balances:
 * - L = g^b * y^r (encrypted amount)
 * - R = g^r (randomness)
 *
 * Where:
 * - g is the Stark curve generator
 * - y is the recipient's public key
 * - b is the balance amount
 * - r is a random value
 */
export interface CipherBalance {
  L: ProjectivePoint;
  R: ProjectivePoint;
}

/**
 * Symmetrically encrypted balance using authenticated encryption.
 * Used for local balance storage after decryption.
 */
export interface AEBalance {
  ciphertext: bigint;
  nonce: bigint;
}

/**
 * Configuration for a Tongo contract deployment.
 */
export interface TongoConfig {
  /** The Tongo contract address */
  address: Address;
  /** The underlying ERC20 token address */
  token: Address;
  /** Optional auditor public key for compliance */
  auditorPublicKey?: ProjectivePoint;
  /** Network/chain identifier */
  chainId?: ChainId;
}

/**
 * A Tongo account state retrieved from the contract.
 */
export interface TongoAccountState {
  /** The account's public key (Stark curve point) */
  publicKey: ProjectivePoint;
  /** The encrypted current balance (can spend) */
  currentBalance: CipherBalance;
  /** The encrypted pending balance (received, needs rollover) */
  pendingBalance: CipherBalance;
  /** The account nonce for transaction ordering */
  nonce: bigint;
  /** The symmetrically encrypted balance hint (for client optimization) */
  aeBalance?: AEBalance | undefined;
}

/**
 * Result of a fund operation.
 */
export interface FundResult {
  /** The new encrypted balance after funding */
  newBalance: CipherBalance;
  /** The transaction hash */
  txHash: string;
}

/**
 * Result of a transfer operation.
 */
export interface TransferResult {
  /** The new encrypted balance after transfer */
  newBalance: CipherBalance;
  /** The transaction hash */
  txHash: string;
}

/**
 * Result of a withdraw operation.
 */
export interface WithdrawResult {
  /** The new encrypted balance after withdrawal */
  newBalance: CipherBalance;
  /** The transaction hash */
  txHash: string;
  /** The amount withdrawn (public) */
  amount: bigint;
}

/**
 * Result of a rollover operation.
 */
export interface RolloverResult {
  /** The new encrypted balance after rollover */
  newBalance: CipherBalance;
  /** The transaction hash */
  txHash: string;
}

/**
 * Result of a ragequit operation.
 */
export interface RagequitResult {
  /** The transaction hash */
  txHash: string;
  /** The total amount withdrawn */
  amount: bigint;
}

/**
 * Options for Tongo operations.
 */
export interface TongoOptions {
  /** Bit size for range proofs (default: 32) */
  bitSize?: number;
  /** Whether to wait for transaction confirmation */
  waitForConfirmation?: boolean;
}

/**
 * Transfer details for confidential transfers.
 */
export interface ConfidentialTransfer {
  /** Recipient's public key */
  to: ProjectivePoint;
  /** Amount to transfer (in base units) */
  amount: bigint;
}
