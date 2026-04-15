import { BridgeToken } from "@/types/bridge/bridge-token";
import { type ConnectedExternalWallet } from "@/connect";
import type {
  Address,
  Amount,
  BridgeCompleteWithdrawFeeEstimation,
  BridgeDepositFeeEstimation,
  BridgeInitiateWithdrawFeeEstimation,
  ExternalAddress,
  ExternalTransactionResponse,
} from "@/types";
import type {
  BridgeDepositOptions,
  CompleteBridgeWithdrawOptions,
  InitiateBridgeWithdrawOptions,
} from "@/bridge/types/BridgeInterface";
import type { Tx } from "@/tx";
import type {
  WithdrawMonitorResult,
  DepositMonitorResult,
  DepositState,
  DepositStateInput,
  WithdrawalState,
  WithdrawalStateInput,
} from "@/bridge/monitor/types";

export interface BridgeOperatorInterface {
  /**
   * Bridge tokens from an external chain into Starknet.
   *
   * @param recipient - Starknet address to receive bridged funds
   * @param amount - Amount to bridge
   * @param token - Bridge token descriptor (chain, protocol, bridge contracts)
   * @param externalWallet - Connected external wallet on the token source chain
   * @param options - Optional bridge/protocol-specific deposit options
   * @returns External transaction response containing the source-chain tx hash
   */
  deposit(
    recipient: Address,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<ExternalTransactionResponse>;

  /**
   * Get the currently available external balance that can be deposited.
   *
   * @param token - Bridge token descriptor to query
   * @param externalWallet - Connected external wallet on the token source chain
   * @returns Available deposit balance on the external chain
   */
  getDepositBalance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount>;

  /**
   * Estimate bridging fees on the source chain and destination messaging layer.
   *
   * @param token - Bridge token descriptor to estimate for
   * @param externalWallet - Connected external wallet on the token source chain
   * @param options - Optional bridge/protocol-specific estimation options
   * @returns Detailed bridge fee estimation for the current route
   */
  getDepositFeeEstimate(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: BridgeDepositOptions
  ): Promise<BridgeDepositFeeEstimation>;

  /**
   * Get the ERC20 allowance granted to the bridge spender on the external chain.
   *
   * Returns `null` when allowance is not applicable.
   *
   * @param token - Bridge token descriptor to query
   * @param externalWallet - Connected external wallet on the token source chain
   * @returns Current allowance, or `null` if allowance is not applicable
   */
  getAllowance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount | null>;

  /**
   * Initiate a withdrawal from Starknet to the external chain.
   *
   * Executes a transaction on Starknet that burns or locks L2 tokens and
   * emits a cross-chain message. For most protocols a separate
   * `completeWithdraw` call on the external chain is required after finality.
   *
   * @param recipient - External chain address to receive the withdrawn funds
   * @param amount - Amount to withdraw
   * @param token - Bridge token descriptor (chain, protocol, bridge contracts)
   * @param externalWallet - Connected external wallet on the destination chain
   * @param options - Bridge protocol hints combined with wallet execute options
   * @returns Starknet Tx tracking the initiate transaction
   */
  initiateWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<Tx>;

  /**
   * Get the L2 token balance available to withdraw (Starknet balance).
   *
   * @param token - Bridge token descriptor to query
   * @param externalWallet - Connected external wallet (used for protocol routing)
   * @returns Available withdrawal balance on Starknet
   */
  getWithdrawBalance(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet
  ): Promise<Amount>;

  /**
   * Estimate the Starknet fee for the `initiateWithdraw` transaction.
   *
   * @param token - Bridge token descriptor to estimate for
   * @param externalWallet - Connected external wallet (used for protocol routing)
   * @param options - Optional protocol-specific options
   * @returns Fee estimation for the Starknet initiate transaction
   */
  getInitiateWithdrawFeeEstimate(
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: InitiateBridgeWithdrawOptions
  ): Promise<BridgeInitiateWithdrawFeeEstimation>;

  /**
   * Complete a withdrawal on the external chain.
   *
   * Only required by protocols where the cross-chain message must be manually
   * finalised after L2 finality (e.g. Canonical bridge, CCTP after Circle
   * attestation). Throws for protocols that deliver automatically.
   *
   * @param recipient - External chain address to receive the withdrawn funds
   * @param amount - Amount being withdrawn
   * @param token - Bridge token descriptor
   * @param externalWallet - Connected external wallet on the destination chain
   * @param options - When provided, must include `protocol: "canonical"` or
   *   `protocol: "cctp"` with the fields required for that protocol (CCTP needs
   *   attestation and message). These are the only protocols that require completion.
   * @returns External transaction response containing the destination-chain tx hash
   */
  completeWithdraw(
    recipient: ExternalAddress,
    amount: Amount,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<ExternalTransactionResponse>;

  /**
   * Estimate the external-chain fee for the `completeWithdraw` transaction.
   *
   * @param amount - Amount being withdrawn
   * @param recipient - External chain recipient address
   * @param token - Bridge token descriptor
   * @param externalWallet - Connected external wallet on the destination chain
   * @param options - Optional protocol-specific options
   * @returns Fee estimation for the external-chain completion transaction
   */
  getCompleteWithdrawFeeEstimate(
    amount: Amount,
    recipient: ExternalAddress,
    token: BridgeToken,
    externalWallet: ConnectedExternalWallet,
    options?: CompleteBridgeWithdrawOptions
  ): Promise<BridgeCompleteWithdrawFeeEstimation>;

  /**
   * Query the current status of a bridge deposit (one-time status snapshot).
   *
   * Requires `bridging.ethereumRpcUrl` to be configured for L1 tx checks.
   *
   * @param token - Bridge token that was deposited.
   * @param externalTxHash - Source-chain transaction hash of the deposit.
   * @param starknetTxHash - Optional. When provided, the L1 check is skipped
   *   and the Starknet transaction is queried directly.
   */
  monitorDeposit(
    token: BridgeToken,
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult>;

  /**
   * Query the current status of a bridge withdrawal (one-time status snapshot).
   *
   * @param token - Bridge token being withdrawn.
   * @param snTxHash - Starknet initiate-withdraw transaction hash.
   * @param externalTxHash - Optional. When provided, the Starknet check is
   *   skipped and the external-chain completion transaction is queried directly.
   */
  monitorWithdrawal(
    token: BridgeToken,
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult>;

  /**
   * Derive the high-level user-facing state of a deposit.
   *
   * Accepts either a previously fetched `DepositMonitorResult` or raw
   * transaction hashes. When hashes are provided, `monitorDeposit` is called
   * internally first.
   *
   * @param token - Bridge token being deposited.
   * @param param - A `DepositMonitorResult` or `{ externalTxHash, starknetTxHash? }`
   * @returns The simplified `DepositState` for the deposit
   */
  getDepositState(
    token: BridgeToken,
    param: DepositStateInput
  ): Promise<DepositState>;

  /**
   * Derive the high-level user-facing state of a withdrawal.
   *
   * Accepts either a previously fetched `WithdrawMonitorResult` or raw
   * transaction hashes. When hashes are provided, `monitorWithdrawal` is called
   * internally first.
   *
   * @param token - Bridge token being withdrawn.
   * @param param - A `WithdrawMonitorResult` or `{ starknetTxHash, externalTxHash? }`
   * @returns The simplified `WithdrawalState` for the withdrawal
   */
  getWithdrawalState(
    token: BridgeToken,
    param: WithdrawalStateInput
  ): Promise<WithdrawalState>;
}
