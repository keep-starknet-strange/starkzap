import type { Call } from "starknet";
import type {
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialState,
} from "@/confidential/types";

/**
 * Protocol-agnostic interface for confidential transaction providers.
 *
 * Implement this interface to plug any confidential/privacy protocol
 * into the StarkZap SDK. The built-in {@link TongoConfidential} is
 * the reference implementation backed by the Tongo protocol.
 *
 * The `populate*` methods return `Call[]` arrays suitable for
 * `wallet.execute()` or `TxBuilder.add()`.
 */
export interface ConfidentialProvider {
  /** Stable provider identifier (e.g. `"tongo"`). */
  readonly id: string;

  /**
   * Get the decrypted confidential account state.
   *
   * Reads the on-chain encrypted balance and decrypts it locally.
   */
  getState(): Promise<ConfidentialState>;

  /** Get the account nonce. */
  getNonce(): Promise<bigint>;

  /**
   * Build the Call(s) for funding this confidential account.
   *
   * The caller is responsible for including an ERC20 approve call
   * before this in the transaction batch.
   */
  populateFund(details: ConfidentialFundDetails): Promise<Call[]>;

  /**
   * Build the Call(s) for a confidential transfer.
   *
   * Generates ZK proofs locally and returns the calls to submit on-chain.
   */
  populateTransfer(details: ConfidentialTransferDetails): Promise<Call[]>;

  /**
   * Build the Call(s) for withdrawing from the confidential account.
   *
   * Converts confidential balance back to public ERC20 tokens.
   */
  populateWithdraw(details: ConfidentialWithdrawDetails): Promise<Call[]>;
}
