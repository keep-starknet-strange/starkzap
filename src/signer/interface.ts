import type {
  Call,
  InvocationsSignerDetails,
  Signature,
  SignerInterface as StarknetSignerInterface,
  TypedData,
} from "starknet";

/**
 * Signer interface for the SDK.
 * Implement this to create custom signers (hardware wallets, MPC, etc.)
 */
export interface SignerInterface {
  /**
   * Get the public key.
   */
  getPubKey(): Promise<string>;

  /**
   * Sign a typed data message (EIP-712 style, for off-chain signatures).
   */
  signMessage(typedData: TypedData, accountAddress: string): Promise<Signature>;

  /**
   * Sign an invoke transaction.
   */
  signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature>;

  /**
   * Get the underlying starknet.js signer for internal use.
   * Required for account deployment which uses signDeployAccountTransaction.
   * @internal
   */
  _getStarknetSigner(): StarknetSignerInterface;
}
