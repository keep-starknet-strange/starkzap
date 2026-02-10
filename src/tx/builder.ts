import type { Call } from "starknet";
import type { WalletInterface } from "@/wallet/interface";
import type { Tx } from "@/tx";
import type {
  Address,
  Amount,
  ExecuteOptions,
  PreflightResult,
  Token,
} from "@/types";

/**
 * Fluent transaction builder for batching multiple operations into a single transaction.
 *
 * Instead of executing each operation separately, `TxBuilder` collects contract calls
 * and submits them all at once via `wallet.execute()`. This saves gas and ensures
 * atomicity — either every operation succeeds or none of them do.
 *
 * Create a builder via `wallet.tx()`, chain operations, then call `.send()`.
 *
 * @example
 * ```ts
 * // Approve + stake in one transaction
 * const tx = await wallet.tx()
 *   .enterPool(poolAddress, Amount.parse("100", STRK))
 *   .send();
 * await tx.wait();
 * ```
 *
 * @example
 * ```ts
 * // Transfer multiple tokens + claim rewards atomically
 * const tx = await wallet.tx()
 *   .transfer(USDC, [
 *     { to: alice, amount: Amount.parse("50", USDC) },
 *     { to: bob, amount: Amount.parse("25", USDC) },
 *   ])
 *   .claimPoolRewards(poolAddress)
 *   .send();
 * ```
 *
 * @example
 * ```ts
 * // Mix high-level helpers with raw calls
 * const tx = await wallet.tx()
 *   .approve(STRK, dexAddress, amount)
 *   .add({ contractAddress: dexAddress, entrypoint: "swap", calldata: [...] })
 *   .transfer(USDC, { to: alice, amount: usdcAmount })
 *   .send();
 * ```
 */
export class TxBuilder {
  private readonly wallet: WalletInterface;
  private readonly pending: (Call[] | Promise<Call[]>)[] = [];
  private sent = false;

  constructor(wallet: WalletInterface) {
    this.wallet = wallet;
  }

  // ============================================================
  // State accessors
  // ============================================================

  /**
   * The number of pending operations in the builder.
   *
   * Each chained method counts as one operation, even if it expands
   * into multiple calls once resolved.
   */
  get length(): number {
    return this.pending.length;
  }

  /**
   * Whether the builder has no pending operations.
   */
  get isEmpty(): boolean {
    return this.pending.length === 0;
  }

  /**
   * Whether `send()` has already been called successfully on this builder.
   */
  get isSent(): boolean {
    return this.sent;
  }

  // ============================================================
  // Raw calls
  // ============================================================

  /**
   * Add one or more raw contract calls to the transaction.
   *
   * Use this for custom contract interactions not covered by the
   * built-in helpers.
   *
   * @param calls - Raw Call objects to include
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * wallet.tx()
   *   .add({
   *     contractAddress: "0x...",
   *     entrypoint: "my_function",
   *     calldata: [1, 2, 3],
   *   })
   *   .send();
   * ```
   */
  add(...calls: Call[]): this {
    this.pending.push(calls);
    return this;
  }

  // ============================================================
  // ERC20 operations
  // ============================================================

  /**
   * Approve an address to spend ERC20 tokens on behalf of the wallet.
   *
   * @param token - The ERC20 token to approve
   * @param spender - The address to approve spending for
   * @param amount - The amount to approve
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * wallet.tx()
   *   .approve(USDC, dexAddress, Amount.parse("1000", USDC))
   *   .add(dexSwapCall)
   *   .send();
   * ```
   */
  approve(token: Token, spender: Address, amount: Amount): this {
    const erc20 = this.wallet.erc20(token);
    this.pending.push([erc20.populateApprove(spender, amount)]);
    return this;
  }

  /**
   * Transfer ERC20 tokens to one or more recipients.
   *
   * Accepts a single transfer object or an array of transfers.
   * Multiple transfers to the same token are batched efficiently.
   *
   * @param token - The ERC20 token to transfer
   * @param transfers - A single transfer or array of transfers
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * // Single transfer
   * wallet.tx()
   *   .transfer(USDC, { to: alice, amount: Amount.parse("50", USDC) })
   *   .send();
   *
   * // Multiple transfers
   * wallet.tx()
   *   .transfer(USDC, [
   *     { to: alice, amount: Amount.parse("50", USDC) },
   *     { to: bob, amount: Amount.parse("25", USDC) },
   *   ])
   *   .send();
   * ```
   */
  transfer(
    token: Token,
    transfers:
      | { to: Address; amount: Amount }
      | { to: Address; amount: Amount }[]
  ): this {
    const erc20 = this.wallet.erc20(token);
    const transferArray = Array.isArray(transfers) ? transfers : [transfers];
    this.pending.push(erc20.populateTransfer(transferArray));
    return this;
  }

  // ============================================================
  // Staking operations
  // ============================================================

  /**
   * Stake tokens in a delegation pool, automatically choosing the right
   * action based on current membership status.
   *
   * - If the wallet is **not** a member, calls `enter_delegation_pool`.
   * - If the wallet **is** already a member, calls `add_to_delegation_pool`.
   *
   * In both cases the token approve call is included automatically.
   *
   * This is the **recommended** way to stake via the builder. Prefer this
   * over {@link enterPool} and {@link addToPool} unless you need explicit
   * control over which entrypoint is called.
   *
   * @param poolAddress - The pool contract address
   * @param amount - The amount of tokens to stake
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * // Works whether the wallet is a new or existing member
   * const tx = await wallet.tx()
   *   .stake(poolAddress, Amount.parse("100", STRK))
   *   .send();
   * await tx.wait();
   * ```
   */
  stake(poolAddress: Address, amount: Amount): this {
    const p = this.wallet.staking(poolAddress).then(async (s) => {
      const isMember = await s.isMember(this.wallet);
      return isMember
        ? s.populateAdd(this.wallet.address, amount)
        : s.populateEnter(this.wallet.address, amount);
    });
    p.catch(() => {});
    this.pending.push(p);
    return this;
  }

  /**
   * Enter a delegation pool as a new member.
   *
   * Automatically includes the token approve call before the pool entry call.
   *
   * **Prefer {@link stake}** which auto-detects membership. Only use this if
   * you are certain the wallet is not already a member — the transaction will
   * revert on-chain otherwise.
   *
   * @param poolAddress - The pool contract address to enter
   * @param amount - The amount of tokens to stake
   * @returns this (for chaining)
   */
  enterPool(poolAddress: Address, amount: Amount): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => s.populateEnter(this.wallet.address, amount));
    p.catch(() => {});
    this.pending.push(p);
    return this;
  }

  /**
   * Add more tokens to an existing stake in a pool.
   *
   * Automatically includes the token approve call before the add-to-pool call.
   *
   * **Prefer {@link stake}** which auto-detects membership. Only use this if
   * you are certain the wallet is already a member — the transaction will
   * revert on-chain otherwise.
   *
   * @param poolAddress - The pool contract address
   * @param amount - The amount of tokens to add
   * @returns this (for chaining)
   */
  addToPool(poolAddress: Address, amount: Amount): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => s.populateAdd(this.wallet.address, amount));
    p.catch(() => {});
    this.pending.push(p);
    return this;
  }

  /**
   * Claim accumulated staking rewards from a pool.
   *
   * **Note:** Unlike `wallet.claimPoolRewards()`, this does not verify
   * membership. The transaction will revert on-chain if the wallet is not
   * a member of the pool.
   *
   * @param poolAddress - The pool contract address
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * wallet.tx()
   *   .claimPoolRewards(poolAddress)
   *   .send();
   * ```
   */
  claimPoolRewards(poolAddress: Address): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => [s.populateClaimRewards(this.wallet.address)]);
    p.catch(() => {});
    this.pending.push(p);
    return this;
  }

  /**
   * Initiate an exit from a delegation pool.
   *
   * After this, wait for the exit window to pass, then call {@link exitPool}
   * to complete the withdrawal.
   *
   * **Note:** Unlike `wallet.exitPoolIntent()`, this does not verify
   * membership or balance. The transaction will revert on-chain if the
   * wallet is not a member or has insufficient stake.
   *
   * @param poolAddress - The pool contract address
   * @param amount - The amount to unstake
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * wallet.tx()
   *   .exitPoolIntent(poolAddress, Amount.parse("50", STRK))
   *   .send();
   * ```
   */
  exitPoolIntent(poolAddress: Address, amount: Amount): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => [s.populateExitIntent(amount)]);
    p.catch(() => {});
    this.pending.push(p);
    return this;
  }

  /**
   * Complete the exit from a delegation pool after the exit window has passed.
   *
   * **Note:** Unlike `wallet.exitPool()`, this does not verify that an exit
   * intent exists. The transaction will revert on-chain if no prior
   * {@link exitPoolIntent} was submitted or the exit window has not elapsed.
   *
   * @param poolAddress - The pool contract address
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * wallet.tx()
   *   .exitPool(poolAddress)
   *   .send();
   * ```
   */
  exitPool(poolAddress: Address): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => [s.populateExit(this.wallet.address)]);
    p.catch(() => {});
    this.pending.push(p);
    return this;
  }

  // ============================================================
  // Terminal operations
  // ============================================================

  /**
   * Resolve all pending operations into a flat array of Calls without executing.
   *
   * Useful for inspection, preflight simulation, or fee estimation.
   *
   * @returns A flat array of all collected Call objects
   *
   * @example
   * ```ts
   * const calls = await wallet.tx()
   *   .transfer(USDC, { to: alice, amount })
   *   .enterPool(poolAddress, stakeAmount)
   *   .calls();
   *
   * const fee = await wallet.estimateFee(calls);
   * ```
   */
  async calls(): Promise<Call[]> {
    const resolved = await Promise.all(this.pending);
    return resolved.flat();
  }

  /**
   * Estimate the fee for all collected calls.
   *
   * Resolves any pending async operations and estimates the execution fee.
   *
   * @returns Fee estimation result
   *
   * @example
   * ```ts
   * const fee = await wallet.tx()
   *   .transfer(USDC, { to: alice, amount })
   *   .enterPool(poolAddress, stakeAmount)
   *   .estimateFee();
   * ```
   */
  async estimateFee() {
    const calls = await this.calls();
    return this.wallet.estimateFee(calls);
  }

  /**
   * Simulate the transaction to check if it would succeed.
   *
   * Resolves all pending operations and runs them through the wallet's
   * preflight simulation without submitting on-chain. Use this to
   * validate the transaction before calling {@link send}.
   *
   * @returns `{ ok: true }` if the simulation succeeds, or
   *          `{ ok: false, reason: string }` with a human-readable error
   *
   * @example
   * ```ts
   * const builder = wallet.tx()
   *   .stake(poolAddress, amount)
   *   .transfer(USDC, { to: alice, amount: usdcAmount });
   *
   * const result = await builder.preflight();
   * if (!result.ok) {
   *   console.error("Transaction would fail:", result.reason);
   * } else {
   *   await builder.send();
   * }
   * ```
   */
  async preflight(): Promise<PreflightResult> {
    const calls = await this.calls();
    return this.wallet.preflight({ calls });
  }

  /**
   * Execute all collected calls as a single atomic transaction.
   *
   * Resolves any pending async operations (e.g., staking pool lookups),
   * flattens all calls, and submits them via `wallet.execute()`.
   *
   * Can only be called once per builder instance.
   *
   * @param options - Optional execution options (e.g., fee mode, gas settings)
   * @returns A Tx object to track the transaction
   * @throws Error if no calls have been added or if already sent
   *
   * @example
   * ```ts
   * const tx = await wallet.tx()
   *   .approve(STRK, poolAddress, stakeAmount)
   *   .enterPool(poolAddress, stakeAmount)
   *   .transfer(USDC, { to: alice, amount: usdcAmount })
   *   .send();
   *
   * console.log(tx.explorerUrl);
   * await tx.wait();
   * ```
   */
  async send(options?: ExecuteOptions): Promise<Tx> {
    if (this.sent) {
      throw new Error("This transaction has already been sent.");
    }

    const calls = await this.calls();
    if (calls.length === 0) {
      throw new Error(
        "No calls to execute. Add at least one operation before calling send()."
      );
    }

    const tx = await this.wallet.execute(calls, options);
    this.sent = true;
    return tx;
  }
}
