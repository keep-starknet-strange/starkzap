import {
  type WithdrawMonitorResult,
  type DepositMonitorResult,
  type WithdrawalState,
  type WithdrawalStateInput,
  type DepositStateInput,
  DepositState,
} from "@/bridge/monitor/types";

export interface BridgeMonitorInterface {
  /**
   * Query the current status of a bridge deposit.
   *
   * @param externalTxHash - The source-chain transaction hash of the deposit.
   * @param starknetTxHash - Optional. When provided, the L1 check is skipped
   *   and the Starknet transaction is queried directly.
   */
  monitorDeposit(
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult>;

  /**
   * Query the current status of a bridge withdrawal.
   *
   * @param snTxHash - The Starknet initiate-withdraw transaction hash.
   * @param externalTxHash - Optional. When provided, the Starknet check is
   *   skipped and the external-chain completion transaction is queried directly.
   */
  monitorWithdrawal(
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
   * @param param - A `DepositMonitorResult` or `{ externalTxHash, starknetTxHash? }`
   * @returns The simplified `DepositState` for the deposit
   */
  getDepositState(param: DepositStateInput): Promise<DepositState>;

  /**
   * Derive the high-level user-facing state of a withdrawal.
   *
   * Accepts either a previously fetched `WithdrawMonitorResult` or raw
   * transaction hashes. When hashes are provided, `monitorWithdrawal` is called
   * internally first.
   *
   * @param param - A `WithdrawMonitorResult` or `{ starknetTxHash, externalTxHash? }`
   * @returns The simplified `WithdrawalState` for the withdrawal
   */
  getWithdrawalState(param: WithdrawalStateInput): Promise<WithdrawalState>;
}
