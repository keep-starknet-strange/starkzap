import type { ExecuteOptions } from "@/types";
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
 * Bridge-internal protocol hints for the initiate-withdrawal step.
 * Not exported — callers use `InitiateBridgeWithdrawOptions`.
 */
type InitiateWithdrawOptions = {
  /**
   * Enable fast transfer mode for CCTP (native USDC) withdrawals.
   *
   * Affects the Circle fee tier used for the Circle attestation step.
   * Ignored by non-CCTP bridge implementations.
   */
  fastTransfer?: boolean;
};

/**
 * Options for `initiateWithdraw` operations.
 *
 * Combines bridge-internal protocol hints with wallet execute options,
 * which are forwarded to `starknetWallet.execute()`.
 */
export type InitiateBridgeWithdrawOptions = InitiateWithdrawOptions &
  ExecuteOptions;

/**
 * Options for `completeWithdraw` operations.
 *
 * Contains arguments required by protocols that need a second on-chain step
 * to finalise a withdrawal on the external chain.
 */
export type CompleteBridgeWithdrawOptions = {
  /**
   * Circle attestation bytes required to complete a CCTP withdrawal.
   *
   * Obtain from Circle's iris API after the Starknet withdrawal transaction
   * achieves the required finality threshold.
   */
  attestation?: string;

  /**
   * The CCTP burn message bytes corresponding to the attestation.
   */
  message?: string;

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
};

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
