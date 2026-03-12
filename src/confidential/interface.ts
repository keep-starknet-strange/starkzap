import type { Call } from "starknet";
import type { Amount } from "@/types/amount";
import type {
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialState,
  ConfidentialRecipient,
} from "@/confidential/types";

/**
 * Protocol-agnostic interface for confidential transaction providers.
 *
 * Implement this interface to plug any confidential/privacy protocol
 * into the StarkZap SDK. The built-in {@link TongoConfidential} is
 * the reference implementation backed by the Tongo protocol.
 */
export interface ConfidentialProvider {
  /** Stable provider identifier (e.g. `"tongo"`). */
  readonly id: string;

  /** The confidential account address (format is provider-specific). */
  readonly address: string;

  /**
   * The identity used to receive confidential transfers to this account.
   *
   * Pass this value as the `to` field of {@link ConfidentialTransferDetails}
   * when sending funds to this account.
   */
  readonly recipientId: ConfidentialRecipient;

  /**
   * Get the decrypted confidential account state.
   *
   * Reads the on-chain encrypted balance and decrypts it locally.
   */
  getState(): Promise<ConfidentialState>;

  /** Get the account nonce. */
  getNonce(): Promise<bigint>;

  /**
   * Convert a public ERC20 amount to confidential units.
   *
   * For providers with a 1:1 rate, this returns the base value unchanged.
   */
  toConfidentialUnits(amount: Amount): Promise<bigint>;

  /**
   * Convert confidential units back to a public ERC20 amount.
   *
   * For providers with a 1:1 rate, this returns the input unchanged.
   */
  toPublicUnits(confidentialAmount: bigint): Promise<bigint>;

  /**
   * Build the Call(s) for funding this confidential account.
   *
   * The returned array includes any prerequisite calls (e.g. ERC20
   * approve) so consumers can execute the batch as-is.
   */
  fund(details: ConfidentialFundDetails): Promise<Call[]>;

  /**
   * Build the Call(s) for a confidential transfer.
   *
   * Generates ZK proofs locally and returns the calls to submit on-chain.
   */
  transfer(details: ConfidentialTransferDetails): Promise<Call[]>;

  /**
   * Build the Call(s) for withdrawing from the confidential account.
   *
   * Converts confidential balance back to public ERC20 tokens.
   */
  withdraw(details: ConfidentialWithdrawDetails): Promise<Call[]>;
}
