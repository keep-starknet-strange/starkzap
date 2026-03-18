import type { Call } from "starknet";
import type { WalletInterface } from "@/wallet/interface";
import type { Tx } from "@/tx";
import type { SwapInput } from "@/swap";
import { resolveSwapInput } from "@/swap/utils";
import type {
  LendingBorrowRequest,
  LendingDepositRequest,
  LendingWithdrawMaxRequest,
  PreparedLendingAction,
  LendingRepayRequest,
  LendingWithdrawRequest,
} from "@/lending";
import type {
  Address,
  Amount,
  ExecuteOptions,
  PreflightResult,
  Token,
} from "@/types";
import type {
  ConfidentialProvider,
  ConfidentialFundDetails,
  ConfidentialTransferDetails,
  ConfidentialWithdrawDetails,
} from "@/confidential";

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
  private readonly pendingErrors: unknown[] = [];
  private sent = false;

  constructor(wallet: WalletInterface) {
    this.wallet = wallet;
  }

  private queueAsyncCalls(promise: Promise<Call[]>): void {
    const tracked = promise.catch((error) => {
      this.pendingErrors.push(error);
      return [];
    });
    this.pending.push(tracked);
  }

  private queueLendingAction(
    action: string,
    preparedPromise: Promise<PreparedLendingAction>
  ): this {
    const calls = preparedPromise.then((prepared) => {
      if (prepared.calls.length === 0) {
        throw new Error(`Lending action "${action}" returned no calls`);
      }
      return prepared.calls;
    });
    this.queueAsyncCalls(calls);
    return this;
  }

  private throwPendingErrorsIfAny(): void {
    if (this.pendingErrors.length === 0) {
      return;
    }

    const errors = this.pendingErrors.splice(0, this.pendingErrors.length);
    if (errors.length === 1) {
      const first = errors[0];
      throw first instanceof Error
        ? first
        : new Error(String(first ?? "Unknown async builder error"));
    }

    const messages = errors
      .map((error) =>
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown async builder error")
      )
      .join("; ");
    throw new Error(
      `Multiple transaction builder operations failed: ${messages}`
    );
  }

  /** The number of pending operations in the builder. */
  get length(): number {
    return this.pending.length;
  }

  get isEmpty(): boolean {
    return this.pending.length === 0;
  }

  get isSent(): boolean {
    return this.sent;
  }

  /** Add one or more raw contract calls to the transaction. */
  add(...calls: Call[]): this {
    this.pending.push(calls);
    return this;
  }

  /** Approve an address to spend ERC20 tokens on behalf of the wallet. */
  approve(token: Token, spender: Address, amount: Amount): this {
    const erc20 = this.wallet.erc20(token);
    this.pending.push([erc20.populateApprove(spender, amount)]);
    return this;
  }

  /** Transfer ERC20 tokens to one or more recipients. */
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

  /** Add a provider-driven swap operation. */
  swap(request: SwapInput): this {
    const { provider, request: resolvedRequest } = resolveSwapInput(request, {
      walletChainId: this.wallet.getChainId(),
      takerAddress: this.wallet.address,
      providerResolver: this.wallet,
    });
    const p = provider.swap(resolvedRequest).then((prepared) => {
      if (prepared.calls.length === 0) {
        throw new Error(`Swap provider "${provider.id}" returned no calls`);
      }
      return prepared.calls;
    });
    this.queueAsyncCalls(p);
    return this;
  }

  lendDeposit(request: LendingDepositRequest): this {
    return this.queueLendingAction(
      "deposit",
      this.wallet.lending().prepareDeposit(request)
    );
  }

  lendWithdraw(request: LendingWithdrawRequest): this {
    return this.queueLendingAction(
      "withdraw",
      this.wallet.lending().prepareWithdraw(request)
    );
  }

  lendWithdrawMax(request: LendingWithdrawMaxRequest): this {
    return this.queueLendingAction(
      "withdrawMax",
      this.wallet.lending().prepareWithdrawMax(request)
    );
  }

  lendBorrow(request: LendingBorrowRequest): this {
    return this.queueLendingAction(
      "borrow",
      this.wallet.lending().prepareBorrow(request)
    );
  }

  lendRepay(request: LendingRepayRequest): this {
    return this.queueLendingAction(
      "repay",
      this.wallet.lending().prepareRepay(request)
    );
  }

  /** Stake tokens in a delegation pool, auto-detecting enter vs add based on membership. */
  stake(poolAddress: Address, amount: Amount): this {
    const p = this.wallet.staking(poolAddress).then(async (s) => {
      const isMember = await s.isMember(this.wallet);
      return isMember
        ? s.populateAdd(this.wallet.address, amount)
        : s.populateEnter(this.wallet.address, amount);
    });
    this.queueAsyncCalls(p);
    return this;
  }

  /** Enter a delegation pool as a new member. Prefer {@link stake} for auto-detection. */
  enterPool(poolAddress: Address, amount: Amount): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => s.populateEnter(this.wallet.address, amount));
    this.queueAsyncCalls(p);
    return this;
  }

  /** Add more tokens to an existing stake. Prefer {@link stake} for auto-detection. */
  addToPool(poolAddress: Address, amount: Amount): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => s.populateAdd(this.wallet.address, amount));
    this.queueAsyncCalls(p);
    return this;
  }

  /** Claim accumulated staking rewards from a pool. */
  claimPoolRewards(poolAddress: Address): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => [s.populateClaimRewards(this.wallet.address)]);
    this.queueAsyncCalls(p);
    return this;
  }

  /** Initiate an exit from a delegation pool (call {@link exitPool} after the exit window). */
  exitPoolIntent(poolAddress: Address, amount: Amount): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => [s.populateExitIntent(amount)]);
    this.queueAsyncCalls(p);
    return this;
  }

  /** Complete the exit from a delegation pool after the exit window has passed. */
  exitPool(poolAddress: Address): this {
    const p = this.wallet
      .staking(poolAddress)
      .then((s) => [s.populateExit(this.wallet.address)]);
    this.queueAsyncCalls(p);
    return this;
  }

  /** Fund a confidential account (approve is included automatically). */
  confidentialFund(
    confidential: ConfidentialProvider,
    details: ConfidentialFundDetails
  ): this {
    this.queueAsyncCalls(confidential.fund(details));
    return this;
  }

  /** Transfer between confidential accounts (generates ZK proofs locally). */
  confidentialTransfer(
    confidential: ConfidentialProvider,
    details: ConfidentialTransferDetails
  ): this {
    this.queueAsyncCalls(confidential.transfer(details));
    return this;
  }

  /** Withdraw from a confidential account to a public address. */
  confidentialWithdraw(
    confidential: ConfidentialProvider,
    details: ConfidentialWithdrawDetails
  ): this {
    this.queueAsyncCalls(confidential.withdraw(details));
    return this;
  }

  /** Resolve all pending operations into a flat array of Calls without executing. */
  async calls(): Promise<Call[]> {
    const resolved = await Promise.all(this.pending);
    this.throwPendingErrorsIfAny();
    return resolved.flat();
  }

  /** Estimate the fee for all collected calls. */
  async estimateFee() {
    const calls = await this.calls();
    return this.wallet.estimateFee(calls);
  }

  /** Simulate the transaction without submitting on-chain. */
  async preflight(): Promise<PreflightResult> {
    const calls = await this.calls();
    return this.wallet.preflight({ calls });
  }

  /** Execute all collected calls as a single atomic transaction. Can only be called once. */
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
