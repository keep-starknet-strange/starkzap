import type { Call } from "starknet";
import {
  Account as TongoAccount,
  type TongoAddress,
} from "@fatsolutions/tongo-sdk";
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
 * Wraps the Tongo confidential transaction protocol for use with StarkZap.
 *
 * Each instance is bound to a single Tongo private key and contract.
 * Use the `populate*` methods to get `Call[]` arrays that can be passed
 * to `wallet.execute()` or added to a `TxBuilder` via `.add()`.
 *
 * @example
 * ```ts
 * import { StarkZap, Confidential } from "starkzap";
 *
 * const sdk = new StarkZap({ network: "mainnet" });
 * const wallet = await sdk.connectWallet({ ... });
 *
 * const confidential = new Confidential({
 *   privateKey: tongoPrivateKey,
 *   contractAddress: TONGO_CONTRACT,
 *   provider: wallet.getProvider(),
 * });
 *
 * // Fund confidential account
 * const tx = await wallet.tx()
 *   .add(...await confidential.populateFund({
 *     amount: 100n,
 *     sender: wallet.address,
 *   }))
 *   .send();
 *
 * // Check balance
 * const state = await confidential.getState();
 * console.log(`Confidential balance: ${state.balance}`);
 * ```
 */
export class Confidential {
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
  get tongoAddress(): TongoAddress {
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
   * Convert an ERC20 amount to tongo units using the on-chain rate.
   */
  async erc20ToTongo(erc20Amount: bigint): Promise<bigint> {
    return await this.account.erc20ToTongo(erc20Amount);
  }

  /**
   * Convert a tongo amount to ERC20 units using the on-chain rate.
   */
  async tongoToErc20(tongoAmount: bigint): Promise<bigint> {
    return await this.account.tongoToErc20(tongoAmount);
  }

  /**
   * Build the Call for funding this confidential account.
   *
   * The caller is responsible for including an ERC20 approve call
   * before this in the transaction batch.
   */
  async populateFund(details: ConfidentialFundDetails): Promise<Call[]> {
    const op = await this.account.fund({
      amount: details.amount,
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
      amount: details.amount,
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
      amount: details.amount,
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
