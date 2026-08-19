import type { Call } from "starknet";
import type { Amount } from "@/types/amount";
import type {
  ConfidentialConfig,
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
  ConfidentialRagequitDetails,
  ConfidentialRolloverDetails,
  ConfidentialState,
  ConfidentialRecipient,
} from "@/confidential/types";

export type TongoSdkModule = typeof import("@fatsolutions/tongo-sdk");

/** The underlying `Account` class instance from the Tongo SDK. */
export type TongoAccount = InstanceType<TongoSdkModule["Account"]>;

let cachedTongoSdk: TongoSdkModule | undefined;
let loadingTongoSdk: Promise<TongoSdkModule> | undefined;

/**
 * Lazily loads @fatsolutions/tongo-sdk and caches the module namespace object.
 *
 * The dependency is an optional peer dependency: it is only required when
 * Tongo confidential transfers are actually used. This is the single place
 * where the SDK's presence is checked at runtime.
 */
export async function loadTongoSdk(
  feature = "Tongo confidential transfers"
): Promise<TongoSdkModule> {
  if (cachedTongoSdk) {
    return cachedTongoSdk;
  }

  loadingTongoSdk ??= import("@fatsolutions/tongo-sdk")
    .then((module) => {
      cachedTongoSdk = module as unknown as TongoSdkModule;
      return cachedTongoSdk;
    })
    .catch((error) => {
      const detail =
        error instanceof Error && error.message
          ? ` Original error: ${error.message}`
          : "";
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "@fatsolutions/tongo-sdk". Install it with: npm i @fatsolutions/tongo-sdk.${detail}`
      );
    })
    .finally(() => {
      loadingTongoSdk = undefined;
    });

  return await loadingTongoSdk;
}

/**
 * Confidential transfers backed by the Tongo protocol.
 *
 * Each instance is bound to a single Tongo private key and contract.
 * Every operation returns plain `Call`s, so they batch with any other
 * calls in a single transaction via {@link TxBuilder}.
 *
 * This is one of two independent privacy integrations and is not
 * interchangeable with the STRK20 privacy pool: Tongo keeps an encrypted
 * *balance* per account and proves locally, while the privacy pool spends
 * *notes* and needs a remote prover whose output rides on the transaction
 * rather than inside a call. Pick whichever protocol you are integrating —
 * there is no shared interface to code against.
 *
 * @example
 * ```ts
 * import { StarkZap, TongoConfidential } from "starkzap";
 *
 * const sdk = new StarkZap({ network: "mainnet" });
 * const wallet = await sdk.connectWallet({ ... });
 *
 * const confidential = await TongoConfidential.create({
 *   privateKey: tongoPrivateKey,
 *   contractAddress: TONGO_CONTRACT,
 *   provider: wallet.getProvider(),
 * });
 *
 * // Fund confidential account (approve is included automatically)
 * const amount = Amount.fromRaw(100n, token);
 * const tx = await wallet.tx()
 *   .confidentialFund(confidential, { amount, sender: wallet.address })
 *   .send();
 *
 * // Check balance
 * const state = await confidential.getState();
 * console.log(`Confidential balance: ${state.balance}`);
 * ```
 */
export class TongoConfidential {
  readonly id = "tongo";
  private readonly sdk: TongoSdkModule;
  private readonly account: TongoAccount;

  private constructor(sdk: TongoSdkModule, account: TongoAccount) {
    this.sdk = sdk;
    this.account = account;
  }

  /**
   * Create a Tongo confidential account.
   *
   * Async because `@fatsolutions/tongo-sdk` is an optional peer dependency
   * loaded on first use; if it is not installed this rejects with an install
   * hint rather than breaking the `starkzap` import.
   */
  static async create(config: ConfidentialConfig): Promise<TongoConfidential> {
    const sdk = await loadTongoSdk();

    // Cast needed: starkzap uses starknet v10 while tongo-sdk (1.5.0) uses v9.
    // The Provider types are runtime-compatible but differ in private fields.
    const account = new sdk.Account(
      config.privateKey,
      config.contractAddress,
      config.provider as never
    );

    return new TongoConfidential(sdk, account);
  }

  /** The Tongo address (base58-encoded public key) for this account. */
  get address(): string {
    return this.account.tongoAddress();
  }

  /** The public key used to receive confidential transfers to this account. */
  get recipientId(): ConfidentialRecipient {
    return this.account.publicKey;
  }

  /**
   * Decode a Tongo address (base58-encoded public key, as returned by
   * {@link address}) into the `{ x, y }` recipient used by {@link transfer}.
   */
  recipientFromAddress(address: string): ConfidentialRecipient {
    return this.sdk.pubKeyBase58ToAffine(address.trim());
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
  async toConfidentialUnits(amount: Amount): Promise<bigint> {
    return await this.account.erc20ToTongo(amount.toBase());
  }

  /**
   * Convert tongo (confidential) units back to a public ERC20 amount
   * using the on-chain rate.
   */
  async toPublicUnits(confidentialAmount: bigint): Promise<bigint> {
    return await this.account.tongoToErc20(confidentialAmount);
  }

  /**
   * Build the Calls for funding this confidential account.
   *
   * The returned array includes the ERC20 approve call (when required)
   * followed by the fund call, so consumers can execute the batch as-is.
   */
  async fund(details: ConfidentialFundDetails): Promise<Call[]> {
    const op = await this.account.fund({
      // Tongo works in confidential units (32-bit), not ERC20 base units.
      amount: await this.toConfidentialUnits(details.amount),
      sender: details.sender,
      ...(details.feeTo !== undefined && { fee_to_sender: details.feeTo }),
    });
    return op.approve ? [op.approve, op.toCalldata()] : [op.toCalldata()];
  }

  /**
   * Build the Call for a confidential transfer.
   *
   * Generates ZK proofs locally and returns the call to submit on-chain.
   */
  async transfer(details: ConfidentialTransferDetails): Promise<Call[]> {
    const op = await this.account.transfer({
      amount: await this.toConfidentialUnits(details.amount),
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
  async withdraw(details: ConfidentialWithdrawDetails): Promise<Call[]> {
    const op = await this.account.withdraw({
      amount: await this.toConfidentialUnits(details.amount),
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
   * This is a Tongo-specific operation.
   */
  async ragequit(details: ConfidentialRagequitDetails): Promise<Call[]> {
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
   * This is a Tongo-specific operation.
   */
  async rollover(details: ConfidentialRolloverDetails): Promise<Call[]> {
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
