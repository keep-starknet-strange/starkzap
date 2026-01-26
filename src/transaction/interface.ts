import type { Signature, Call, Calldata } from "starknet";

/**
 * Interface for a transaction that can be signed.
 *
 * This allows custom account implementations to override hash calculation
 * for account abstraction with custom validation logic.
 */
export interface SignableTransaction {
  /**
   * The type of transaction.
   */
  readonly type: "INVOKE" | "DEPLOY_ACCOUNT" | "DECLARE";

  /**
   * Get the hash that needs to be signed.
   *
   * Custom account implementations can override this to implement
   * custom validation logic (e.g., multisig, session keys, etc.)
   */
  getHashToSign(): string;

  /**
   * Get the transaction details for submission.
   */
  getDetails(): TransactionDetails;
}

/**
 * Details of an invoke transaction.
 */
export interface InvokeTransactionDetails {
  type: "INVOKE";
  senderAddress: string;
  calls: Call[];
  calldata: Calldata;
  version: string;
  chainId: string;
  nonce: bigint;
  resourceBounds: ResourceBounds;
  tip: bigint;
  paymasterData: string[];
  accountDeploymentData: string[];
  nonceDataAvailabilityMode: string;
  feeDataAvailabilityMode: string;
}

/**
 * Details of a deploy account transaction.
 */
export interface DeployAccountTransactionDetails {
  type: "DEPLOY_ACCOUNT";
  contractAddress: string;
  classHash: string;
  constructorCalldata: Calldata;
  addressSalt: string;
  version: string;
  chainId: string;
  nonce: bigint;
  resourceBounds: ResourceBounds;
  tip: bigint;
  paymasterData: string[];
  nonceDataAvailabilityMode: string;
  feeDataAvailabilityMode: string;
}

/**
 * Details of a declare transaction.
 */
export interface DeclareTransactionDetails {
  type: "DECLARE";
  senderAddress: string;
  classHash: string;
  compiledClassHash: string;
  version: string;
  chainId: string;
  nonce: bigint;
  resourceBounds: ResourceBounds;
  tip: bigint;
  paymasterData: string[];
  accountDeploymentData: string[];
  nonceDataAvailabilityMode: string;
  feeDataAvailabilityMode: string;
}

export type TransactionDetails =
  | InvokeTransactionDetails
  | DeployAccountTransactionDetails
  | DeclareTransactionDetails;

/**
 * Resource bounds for V3 transactions.
 */
export interface ResourceBounds {
  l1_gas: {
    max_amount: bigint;
    max_price_per_unit: bigint;
  };
  l2_gas: {
    max_amount: bigint;
    max_price_per_unit: bigint;
  };
  l1_data_gas: {
    max_amount: bigint;
    max_price_per_unit: bigint;
  };
}

/**
 * A signed transaction ready for submission.
 */
export interface SignedTransaction {
  /**
   * The signable transaction that was signed.
   */
  readonly transaction: SignableTransaction;

  /**
   * The signature.
   */
  readonly signature: Signature;
}
