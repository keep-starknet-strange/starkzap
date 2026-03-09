import type { Call } from "starknet";
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import type { ConfidentialProvider } from "@/confidential/interface";
import type {
  ConfidentialConfig,
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialRagequitDetails,
  ConfidentialRolloverDetails,
  ConfidentialState,
} from "@/confidential/types";

/**
 * Tongo implementation of the {@link ConfidentialProvider} interface.
 *
 * Each instance is bound to a single Tongo private key and contract.
 * Use the `populate*` methods to get `Call[]` arrays that can be passed
 * to `wallet.execute()` or added to a `TxBuilder` via `.add()`.
 *
 * In addition to the standard {@link ConfidentialProvider} methods,
 * this class exposes Tongo-specific operations: {@link populateRagequit},
 * {@link populateRollover}, and direct access to the underlying Tongo account.
 *
 * @example
 * ```ts
 * import { StarkZap, TongoConfidential } from "starkzap";
 *
 * const sdk = new StarkZap({ network: "mainnet" });
 * const wallet = await sdk.connectWallet({ ... });
 *
 * const confidential = new TongoConfidential({
 *   privateKey: tongoPrivateKey,
 *   contractAddress: TONGO_CONTRACT,
 *   provider: wallet.getProvider(),
 * });
 *
 * // Fund confidential account (approve + fund in one tx)
 * const amount = Amount.fromRaw(100n, token);
 * const tx = await wallet.tx()
 *   .approve(token, TONGO_CONTRACT, amount)
 *   .confidentialFund(confidential, { amount, sender: wallet.address })
 *   .send();
 *
 * // Check balance
 * const state = await confidential.getState();
 * console.log(`Confidential balance: ${state.balance}`);
 * ```
 */
export class TongoConfidential implements ConfidentialProvider {
  readonly id = "tongo";
  private readonly account: TongoAccount;

  constructor(config: ConfidentialConfig) {
    // Cast needed: starkzap uses starknet v9 while tongo-sdk uses v8.
    // The Provider types are runtime-compatible but differ in private fields.
    this.account = new TongoAccount(
      config.privateKey,
      config.contractAddress,
      config.provider as never
    );
  }

  /** The Tongo address (base58-encoded public key) for this account. */
  get address(): string {
    return this.account.tongoAddress();
  }

  /**
   * Get the decrypted confidential account state.
   *
   * Reads the on-chain encrypted balance and decrypts it locally
   * using the private key.
   */
  async getState(): Promise<ConfidentialState> {
    return await this.account.state();
  }

  /**
   * Get the account nonce.
   */
  async getNonce(): Promise<bigint> {
    return await this.account.nonce();
  }

  /**
   * Convert a public ERC20 amount to tongo (confidential) units
   * using the on-chain rate.
   */
  async toConfidentialUnits(erc20Amount: bigint): Promise<bigint> {
    return await this.account.erc20ToTongo(erc20Amount);
  }

  /**
   * Convert tongo (confidential) units back to a public ERC20 amount
   * using the on-chain rate.
   */
  async toPublicUnits(confidentialAmount: bigint): Promise<bigint> {
    return await this.account.tongoToErc20(confidentialAmount);
  }

  /**
   * Build the Call for funding this confidential account.
   *
   * The caller is responsible for including an ERC20 approve call
   * before this in the transaction batch.
   */
  async populateFund(details: ConfidentialFundDetails): Promise<Call[]> {
    const op = await this.account.fund({
      amount: details.amount.toBase(),
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  /**
   * Build the Call for a confidential transfer.
   *
   * Generates ZK proofs locally and returns the call to submit on-chain.
   */
  async populateTransfer(
    details: ConfidentialTransferDetails
  ): Promise<Call[]> {
    const op = await this.account.transfer({
      amount: details.amount.toBase(),
      to: details.to,
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  /**
   * Build the Call for withdrawing from the confidential account.
   *
   * Converts confidential balance back to public ERC20 tokens.
   */
  async populateWithdraw(
    details: ConfidentialWithdrawDetails
  ): Promise<Call[]> {
    const op = await this.account.withdraw({
      amount: details.amount.toBase(),
      to: details.to,
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  /**
   * Build the Call for an emergency ragequit (full withdrawal).
   *
   * Exits the entire confidential balance to a public address.
   */
  async populateRagequit(
    details: ConfidentialRagequitDetails
  ): Promise<Call[]> {
    const op = await this.account.ragequit({
      to: details.to,
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return [op.toCalldata()];
  }

  /**
   * Build the Call for a rollover (activate pending balance).
   *
   * Moves pending balance (from received transfers) into the active balance.
   */
  async populateRollover(
    details: ConfidentialRolloverDetails
  ): Promise<Call[]> {
    const op = await this.account.rollover({
      sender: details.sender,
    });
    return [op.toCalldata()];
  }

  /**
   * Access the underlying Tongo Account for advanced operations.
   *
   * Use this for event reading, audit proofs, or other operations
   * not covered by the convenience methods.
   */
  getTongoAccount(): TongoAccount {
    return this.account;
  }
}
