import type { ExecuteOptions, Token } from "@/types";
import {
  type Address,
  Amount,
  type BridgeCompleteWithdrawFeeEstimation,
  type BridgeDepositFeeEstimation,
  type BridgeInitiateWithdrawFeeEstimation,
  type ExternalAddress,
  type ExternalTransactionResponse,
} from "@/types";
import type { WalletInterface } from "@/wallet";
import type { Tx } from "@/tx";

/**
 * Protocol-specific options for bridge deposit operations.
 *
 * These options are passed through the generic bridge interface and operator.
 * Each bridge implementation reads only the fields relevant to its protocol
 * and ignores the rest.
 */
export interface BridgeDepositOptions {
  /**
   * Enable fast transfer mode for CCTP (native USDC) deposits.
   *
   * When `true`, the deposit uses a lower finality threshold and pays
   * a small basis-point fee (deducted from the transferred USDC amount)
   * in exchange for faster cross-chain settlement.
   *
   * Ignored by non-CCTP bridge implementations.
   */
  fastTransfer?: boolean;
}

/**
 * Initiate-withdrawal options specific to the canonical Ethereum bridge.
 *
 * When `autoWithdraw` is `true`, the L2 transaction includes an auto-withdraw
 * payload so a relayer can finalise the withdrawal on L1 without manual user
 * action. An optional `preferredFeeToken` hints which fee token the relayer
 * should use; if omitted or unavailable the handler picks the first affordable
 * token.
 */
export interface EthereumInitiateBridgeWithdrawOptions {
  protocol: "canonical";
  /** Enable automatic L1 completion via a relayer. */
  autoWithdraw?: boolean;
  /** Preferred fee token for the auto-withdraw gas payment. */
  preferredFeeToken?: Token;
}

/**
 * Initiate-withdrawal options specific to the CCTP (Circle) bridge.
 *
 * When `fastTransfer` is `true`, a lower finality threshold is used and a
 * small basis-point fee is deducted from the transferred amount in exchange
 * for faster cross-chain settlement.
 */
export interface CCTPInitiateWithdrawBridgeOptions {
  protocol: "cctp";
  /** Use Circle's fast-transfer tier for this withdrawal. */
  fastTransfer?: boolean;
}

/**
 * Options for `initiateWithdraw` operations.
 *
 * The discriminant field `protocol` selects the protocol-specific options.
 * Wallet execute options (`feeMode`, `timeBounds`) are forwarded to
 * `starknetWallet.execute()` regardless of protocol.
 */
export type InitiateBridgeWithdrawOptions = ExecuteOptions &
  (EthereumInitiateBridgeWithdrawOptions | CCTPInitiateWithdrawBridgeOptions);

/**
 * Complete-withdrawal options for the canonical Ethereum (StarkGate) bridge.
 *
 * L1 completion uses burn/recipient context from the withdrawal; no extra
 * payload is required beyond the discriminant.
 */
export interface CanonicalCompleteBridgeWithdrawOptions {
  protocol: "canonical";
}

/**
 * CCTP-specific data required to complete a withdrawal on the external chain.
 *
 * All fields are obtained from Circle's iris API after the Starknet
 * withdrawal transaction achieves the required finality threshold.
 */
export interface CCTPCompleteBridgeWithdrawOptions {
  protocol: "cctp";

  /**
   * Circle attestation bytes required to call `receiveMessage` on L1.
   */
  attestation: string;

  /**
   * The CCTP burn message bytes corresponding to the attestation.
   */
  message: string;

  /**
   * The CCTP message nonce. Required for re-attestation when the original
   * attestation has expired (i.e. `expirationBlock` has passed).
   */
  nonce?: string;

  /**
   * The L1 block number at which the attestation expires. When the current
   * block approaches this value, a re-attestation request is made to Circle
   * before calling `receiveMessage`.
   */
  expirationBlock?: number;
}

/**
 * Options for `completeWithdraw` operations.
 *
 * The discriminant field `protocol` selects protocol-specific fields: CCTP
 * requires attestation data; canonical Ethereum completion does not.
 *
 * Wallet execute options (`feeMode`, `timeBounds`) are included for API
 * consistency; L1 completion paths may ignore them.
 */
export type CompleteBridgeWithdrawOptions = ExecuteOptions &
  (CanonicalCompleteBridgeWithdrawOptions | CCTPCompleteBridgeWithdrawOptions);

export interface BridgeInterface<A extends ExternalAddress = ExternalAddress> {
  readonly starknetWallet: WalletInterface;

  deposit(
    recipient: Address,
    amount: Amount,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse>;

  getDepositFeeEstimate(
    options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation>;

  getAvailableDepositBalance(account: A): Promise<Amount>;

  getAllowance(): Promise<Amount | null>;

  /**
   * Initiate a withdrawal from Starknet to the external chain.
   *
   * Executes a transaction on Starknet (via `starknetWallet.execute`) that
   * burns or locks the L2 tokens and emits a cross-chain message.
   * For most protocols a separate `completeWithdraw` call on the external
   * chain is required after finality.
   */
  initiateWithdraw?(
    recipient: A,
    amount: Amount,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx>;

  /**
   * Estimate the Starknet fee for the `initiateWithdraw` transaction.
   */
  getInitiateWithdrawFeeEstimate?(
    options?: InitiateBridgeWithdrawOptions
  ): Promise<BridgeInitiateWithdrawFeeEstimation>;

  /**
   * Get the L2 balance available to withdraw (i.e. the Starknet token balance).
   */
  getAvailableWithdrawBalance?(account: Address): Promise<Amount>;

  /**
   * Complete a withdrawal on the external chain.
   *
   * Only required by protocols where the cross-chain message must be manually
   * finalised (e.g. Canonical bridge after L2 finality, CCTP after Circle
   * attestation). Protocols that deliver automatically (OFT, Hyperlane) do
   * not implement this method.
   *
   * When `options` is provided, include `protocol: "canonical"` or
   * `protocol: "cctp"` with the fields required for that protocol.
   * These are the only protocols that require completion.
   */
  completeWithdraw?(
    recipient: A,
    amount: Amount,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse>;

  /**
   * Estimate the external-chain fee for the `completeWithdraw` transaction.
   */
  getCompleteWithdrawFeeEstimate?(
    amount: Amount,
    recipient: A,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<BridgeCompleteWithdrawFeeEstimation>;
}
