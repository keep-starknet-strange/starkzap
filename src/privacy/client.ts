import type { Call, RpcProvider, Signature, TypedData } from "starknet";
import type {
  CallAndProof,
  PrivateRegistry,
  PrivateTransfersBuilder,
  PrivateTransfersInterface,
  Warning,
  ExecuteOptions as SdkExecuteOptions,
} from "@starkware-libs/starknet-privacy-sdk";

import type { Address, ChainId } from "@/types";
import { fromAddress } from "@/types";
import {
  PrivacyPaymaster,
  type PrivacyFeeQuote,
  type PrivacyPaymasterConfig,
  type PrivacyInvoke,
  type PrivacySignedInvoke,
  type PrivacySubmission,
} from "@/privacy/paymaster";
import {
  PROOF_BASE_BLOCK_DEPTH,
  waitForProvableBlock,
  type ProvableBlockOptions,
} from "@/privacy/sequencing";

/** Options for a single {@link PrivacyClient.send}. */
export interface PrivacySendOptions extends Omit<
  SdkExecuteOptions,
  "provingBlockId"
> {
  /**
   * Prove against this block instead of one picked from the chain head.
   *
   * Use it when the proof depends on something this client cannot see, such as a
   * deposit's funds having arrived. `waitForFundedBalance` returns such a block.
   *
   * This sets the earliest block, not an exact one. A block older than this
   * client's last transaction cannot work, because the proof would not include
   * that transaction. The client waits for it instead. So the block used may be
   * later than the one you pass, never earlier.
   */
  provingBlockId?: number;
  /**
   * Depth, poll interval, timeout and per-poll callback for the wait before
   * proving.
   *
   * Forwarded whole to {@link waitForProvableBlock}. `onAttempt` is the one most
   * callers want — the wait is silent otherwise, and on a slow chain it is
   * minutes long, so "it hung" and "it is waiting for a block" look identical.
   * The rest matter for anything that cannot sit on the default two-second poll:
   * a devnet where blocks arrive instantly, or a test.
   */
  wait?: ProvableBlockOptions;
  /**
   * Public calls to relay in the same transaction as the private one.
   *
   * For the step that has to happen in public anyway — the ERC20 `approve` before
   * a deposit is the standard case. Without this it is a separate transaction
   * that the user signs and pays for themselves; with it, the relayer submits it
   * through the account's `execute_from_outside`, so it lands atomically with the
   * pool action.
   *
   * These calls are *not* private. They name the account, so use this for work
   * that is already public, not to hide anything.
   *
   * Requires {@link PaymasterBinding.account}, and requires that account to
   * support SNIP-9 outside execution — a property of the user's wallet, not of
   * your configuration. `connectPrivacy` wires this up; a client built by hand
   * through {@link withPaymaster} has to pass `account` itself.
   *
   * Build these with `wallet.tx()` rather than by hand — `calls()` resolves the
   * fluent builder into exactly this shape, so the ERC20 and protocol helpers are
   * all available:
   *
   * ```ts
   * invoke: await wallet.tx().approve(STRK, poolAddress, amount).calls()
   * ```
   *
   * Merging the approve does not remove what a deposit proof needs from the
   * chain. The approve is checked when the deposit *executes*, so it does not
   * have to age — but the depositor's balance is read at the proving block, so
   * funds that have just arrived still need
   * {@link PrivacySendOptions.provingBlockId} or a wait on the balance. Wrapping
   * saves a transaction, not the settling.
   */
  invoke?: Call[];
  /**
   * Called with the privacy SDK's warnings about the composed transaction, before
   * it is submitted. Only called when there are any.
   *
   * `USER_LINKAGE` is the one to expect: the SDK saying this transaction may
   * connect the user's private and public identities, which for a withdrawal back
   * to the deposit address it will. Whether that is acceptable is yours to
   * decide, so nothing is refused on your behalf.
   *
   * Awaited, so you can ask the user. **Throw to abort** — your error propagates
   * unchanged, so the reason reaches your own UI. Returning normally submits.
   *
   * By this point the proof exists and has been paid for. Aborting saves the pool
   * fee and the submission, not the proving.
   *
   * To see the same warnings before paying for anything, call
   * {@link PrivacyClient.simulate} with this callback and these options first. It
   * composes what this would compose, fee withdrawal included, against a mock
   * prover.
   */
  onWarnings?: (warnings: Warning[]) => unknown;
}

/** What a simulation reports about the transaction `send` would compose. */
export interface PrivacySimulation {
  /**
   * Warnings the SDK raises for it, `USER_LINKAGE` among them.
   *
   * The same list {@link PrivacySendOptions.onWarnings} would receive, seen before
   * paying a prover rather than after.
   */
  warnings: Warning[];
  /** The fee `send` would append, from a quote taken at the same moment. */
  feeAction: PrivacyFeeQuote["feeAction"];
}

/** What {@link PrivacyClient.send} reports about the transaction it submitted. */
export interface PrivacySendResult extends PrivacySubmission {
  /**
   * The private state the transaction leaves behind: notes spent and created,
   * channels opened, and how far discovery scanned.
   *
   * A copy. Pass `registry` in the options to compile against one you keep, and
   * this layer still never writes to it — adopt this result when you are
   * satisfied the transaction landed, or discard it and let discovery rebuild.
   * Ignore it entirely to have each transaction discover its own state.
   */
  registry: PrivateRegistry;
}

/**
 * A privacy pool client that owns the fee, the proving block and submission.
 *
 * Everything else is the privacy SDK's, delegated verbatim. Reads take no fee,
 * build no proof and submit nothing, so there is nothing for this layer to add
 * to them. The SDK's own client is on {@link PrivacyClient.transfers} for
 * anything not covered here.
 *
 * The paths that *produce* a proof are deliberately not re-exposed: `execute`,
 * `createProofInvocation` and `build` would each let a caller skip the fee
 * withdrawal and then fail on-chain. Use {@link PrivacyClient.send}, or compose
 * against `transfers` yourself and finish with {@link PrivacyClient.submit}.
 */
export interface PrivacyClient extends Pick<
  PrivateTransfersInterface,
  | "user"
  | "discoverRequirement"
  | "discoverNotes"
  | "discoverChannels"
  | "invalidateProofNonceCache"
> {
  /** The privacy SDK's own client, for anything this layer does not wrap. */
  readonly transfers: PrivateTransfersInterface;

  /**
   * What the next transaction will cost, before committing to a proof.
   *
   * Show this to users rather than a simulated gas figure: the pool fee is a
   * separate withdrawal the paymaster requires, and it is what actually leaves the
   * shielded balance. {@link PrivacyClient.simulate} reports the same figure
   * alongside the warnings, if you want both in one call.
   */
  quote(): Promise<PrivacyFeeQuote>;

  /**
   * Run what {@link PrivacyClient.send} would run, without proving it.
   *
   * Takes the same callback and the same options, quotes the same fee, appends
   * the same withdrawal and resolves the same proving block, then simulates
   * against a mock prover. So the warnings it reports are the ones the real
   * transaction would raise, which the inherited `simulate` could not tell you:
   * that one takes a raw action list and knows nothing about the paymaster's fee.
   *
   * Resolving the proving block matters more than it sounds: channels and notes
   * are discovered *at* that block, so a simulation against the chain head would
   * answer for a different transaction than the one submitted.
   *
   * Cheap on purpose. It costs a quote, a chain-head read and a simulation. It
   * waits for no block and writes no private state, so it is safe to run while a
   * send is in flight — the trade being that in that window it reads a slightly
   * older block than the send will prove against, since waiting for the previous
   * transaction to age is exactly what this must not do.
   *
   * The mock proof is deliberately not returned. It has the shape of a proof and
   * none of the substance, and handing one back invites submitting it.
   *
   * @param compose - Adds the operations to simulate, as `send` would take them
   * @param options - The options `send` would take
   * @returns The warnings, and the fee the real send would withdraw
   */
  simulate(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySimulation>;

  /**
   * Compose, prove and submit one private transaction.
   *
   * The callback receives the privacy SDK's own builder, unwrapped. Write
   * exactly what the SDK documents. This method brackets it: it quotes the fee,
   * waits for a provable block, appends the paymaster's fee withdrawal as the
   * final action, proves, and submits through the paymaster's relayer so the
   * account never appears on-chain.
   *
   * Pass {@link PrivacySendOptions.invoke} to carry public calls in the same
   * transaction (an `approve` before a deposit typically). Those calls are
   * relayed through the account's `execute_from_outside`, so they are signed and
   * are not private. The private part still is.
   *
   * The callback may be `async`, and is awaited. Its return type is `unknown`
   * rather than `void | Promise<void>` because the builder is fluent: callers
   * naturally return it from a chain, and TypeScript's rule that a `void` return
   * accepts any value does not extend to a union, so the narrower type would
   * reject every chained callback.
   *
   * @param compose - Adds the operations to perform. Awaited, so it may be async
   * @param options - SDK execute options, proving-block overrides, and any
   *   public calls to relay
   * @returns The transaction hash, the relayer's tracking id when it gave one,
   *   and the private state the transaction leaves behind. Nothing can look a
   *   tracking id up later, so this is the only chance to record it.
   *
   * @example
   * ```ts
   * const { transactionHash } = await privacy.send((b) =>
   *   b.with(STRK, (t) => t.transfer({ recipient: bob, amount })).surplusTo(me)
   * );
   * ```
   *
   * @example Deposit without a separate approve transaction
   * ```ts
   * const { transactionHash } = await privacy.send(
   *   (b) => b.with(STRK, (t) => t.deposit({ amount })),
   *   { invoke: await wallet.tx().approve(STRK, poolAddress, amount).calls() }
   * );
   * ```
   */
  send(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySendResult>;

  /**
   * Submit a proof you composed and generated yourself.
   *
   * The escape hatch for flows this layer does not model, like a private swap
   * built against {@link PrivacyClient.transfers}. You are responsible for
   * having included the fee withdrawal from {@link PrivacyClient.quote}. The
   * paymaster rejects a proof without it.
   *
   * @param callAndProof - The pool call and its proof
   * @returns The transaction hash, and the relayer's tracking id when it gave one
   */
  submit(callAndProof: CallAndProof): Promise<PrivacySubmission>;
}

/**
 * What {@link withPaymaster} needs beyond the SDK client: a
 * {@link PrivacyPaymasterConfig}, plus the two things only the caller knows.
 */
export interface PaymasterBinding extends PrivacyPaymasterConfig {
  /** Pool the client is bound to. */
  poolContractAddress: string;
  /** Provider used to read the chain head when resolving the proving block. */
  provider: RpcProvider;
  /**
   * Chain this client is bound to. Used to check that typed data from the
   * paymaster is bound to the same one before anything signs it.
   */
  chainId: ChainId;
  /**
   * The account behind the client, needed only to relay public calls alongside
   * the private transaction. See {@link PrivacySendOptions.invoke}.
   *
   * Address and signer travel together deliberately: a signature is worthless
   * without knowing which account it is for, and the paymaster builds the typed
   * data from the address before there is anything to sign.
   *
   * Nothing else on this client needs it. Private transactions are authorised by
   * the proof alone, which is what keeps the account off-chain.
   */
  account?: {
    /** Account the relayed calls belong to. Must support SNIP-9. */
    address: Address;
    /** Signs the paymaster's SNIP-12 typed data, e.g. `wallet.signMessage`. */
    signTypedData: (typedData: TypedData) => Promise<Signature>;
  };
}

/**
 * Add fee handling, block sequencing and paymaster submission to a raw privacy
 * SDK client.
 *
 * `connectPrivacy` returns an already-bound client; this is for code that
 * called {@link createPrivacy} directly and now wants the same behaviour
 * without reimplementing the fee dance.
 *
 * @param transfers - The privacy SDK client, e.g. from {@link createPrivacy}
 * @param binding - Pool, paymaster endpoint, fee mode and provider
 * @returns A client that owns fee, proving block and submission
 */
export function withPaymaster(
  transfers: PrivateTransfersInterface,
  binding: PaymasterBinding
): PrivacyClient {
  const paymaster = new PrivacyPaymaster(binding.url, {
    ...(binding.maxFee !== undefined && { maxFee: binding.maxFee }),
    ...(binding.allowedFeeRecipients !== undefined && {
      allowedFeeRecipients: binding.allowedFeeRecipients,
    }),
    ...(binding.fetch && { fetch: binding.fetch }),
  });
  const pool = fromAddress(binding.poolContractAddress);

  // Hash of this client's most recent submission. A proof must read pool state
  // that already includes it, otherwise the next transaction spends notes the
  // proof still believes are unspent, and the pool rejects it. Tracked here so
  // callers do not have to.
  let lastSubmittedTxHash: string | undefined;

  // Settles once everything queued so far has finished.
  let queue: Promise<void> = Promise.resolve();

  /**
   * Run one build-prove-submit at a time.
   *
   * Two proofs cannot be built at once on one client, whatever they contain. The
   * SDK fetches the pool nonce once and caches it, so overlapping proofs share a
   * nonce and one is stale before it is submitted. They also share the checkpoint
   * that says which block to prove from. Two transfers of different tokens still
   * collide on both.
   *
   * `submit` takes its turn too, even though its proof may have been built
   * somewhere else entirely. Submitting writes that checkpoint, and a failed
   * submit clears this client's nonce cache — which would strand a proof another
   * send is halfway through building.
   *
   * Waiting is cheap next to that: a send takes minutes, and the pool accepts a
   * proof for hundreds of blocks.
   *
   * Scope is this client, meaning one account and one pool. Separate accounts get
   * separate clients and never wait on each other, and reads are not queued at
   * all. What a queue cannot cover is a reload, which starts with no memory of a
   * send from moments before.
   */
  function sequenced<T>(work: () => Promise<T>): Promise<T> {
    // Wait for the current queue, then become the thing others wait for.
    const result = queue.then(work);
    // Tracks completion, not success: one failed send must not block the next.
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /**
   * Refuse a sponsored fee larger than the one the pool itself publishes.
   *
   * Under `sponsored` the relayer fronts the gas, so the withdrawal is the pool
   * fee and nothing else — and the pool exposes that figure on chain. Reading it
   * makes the amount the one part of a quote that does not rest on trusting the
   * endpoint, and it caps what a substituted fee recipient could ever collect.
   *
   * Only that mode. `default` mixes in a gas ceiling the pool knows nothing
   * about, and `sponsored_private` converts the fee into another token at a rate
   * that is not on chain, so neither has a published figure to compare against.
   *
   * A quote *below* the published fee is left alone: the pool refuses an
   * underpaid fee itself, so that direction costs the relayer rather than the
   * caller.
   */
  async function assertWithinPublishedFee(
    feeAction: PrivacyFeeQuote["feeAction"]
  ): Promise<void> {
    if (binding.fee.mode !== "sponsored") return;

    let published: bigint;
    try {
      const [value] = await binding.provider.callContract({
        contractAddress: pool,
        entrypoint: "get_fee_amount",
        calldata: [],
      });
      published = BigInt(value ?? "");
    } catch (error) {
      // Reported, not fatal. This is a second opinion on the fee, and a read
      // that could not be taken is a reason to say so rather than to fail a
      // transaction the paymaster already priced.
      console.warn(
        "[starkzap] Could not read the pool's own fee to check the quote " +
          `against it: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    if (feeAction.amount > published) {
      throw new Error(
        `[starkzap] The paymaster quoted a pool fee of ${feeAction.amount}, ` +
          `above the ${published} this pool publishes as its own fee. Nothing ` +
          "was withdrawn."
      );
    }
  }

  async function quote(invoke?: PrivacyInvoke): Promise<PrivacyFeeQuote> {
    const feeQuote = await paymaster.quote(pool, binding.fee, {
      ...(binding.tip && { tip: binding.tip }),
      ...(invoke && { invoke }),
    });
    await assertWithinPublishedFee(feeQuote.feeAction);
    return feeQuote;
  }

  /**
   * Turn requested calls into a {@link PrivacyInvoke} plus the signer for it.
   *
   * The two are returned together so the signing step cannot be reached without
   * the signer that made the request valid. Checked before quoting, so a client
   * with no signer fails on the request itself rather than after a round trip
   * that returns typed data nothing can sign.
   */
  function resolveInvoke(calls: Call[] | undefined):
    | {
        invoke: PrivacyInvoke;
        signTypedData: (typedData: TypedData) => Promise<Signature>;
      }
    | undefined {
    if (!calls?.length) return undefined;

    const account = binding.account;
    if (!account) {
      throw new Error(
        "[starkzap] `send({ invoke })` relays calls through the account's " +
          "`execute_from_outside`, so it needs that account and a way to sign " +
          "for it. `connectPrivacy()` provides both; a client built with " +
          "`withPaymaster` has to pass `account: { address, signTypedData }`."
      );
    }
    return {
      invoke: {
        userAddress: account.address,
        calls,
        chainId: binding.chainId.toLiteral(),
      },
      signTypedData: account.signTypedData,
    };
  }

  /**
   * Append the paymaster's fee withdrawal as the final action.
   *
   * The forwarder collects its fee from this withdrawal, so a proof without it is
   * rejected (code 165). A zero amount means the deployment charges nothing, and
   * the withdrawal is then omitted rather than sent as a no-op transfer.
   */
  function appendFeeWithdrawal(
    builder: PrivateTransfersBuilder,
    feeAction: PrivacyFeeQuote["feeAction"]
  ): void {
    if (feeAction.amount === 0n) return;
    builder.with(feeAction.token, (t) =>
      t.withdraw({ recipient: feeAction.recipient, amount: feeAction.amount })
    );
  }

  /** Block the previous send landed in, or -1 when there is nothing to age. */
  async function previousBlock(): Promise<number> {
    if (lastSubmittedTxHash === undefined) return -1;

    // `errorStates: []` so a reverted previous transaction does not fail *this*
    // send: it still occupies a block, and ageing that block is harmless.
    const receipt = await binding.provider.waitForTransaction(
      lastSubmittedTxHash,
      {
        errorStates: [],
      }
    );
    return receipt.isError() ? -1 : receipt.block_number;
  }

  /**
   * The block a proof would use if it could be built right now.
   *
   * One chain-head read, no polling — the non-waiting counterpart to
   * {@link resolveProvingBlock}. Clamped at 0 so a chain shallower than the depth
   * window yields a block that exists rather than a negative one.
   */
  async function provableBlockNow(): Promise<number> {
    const head = await binding.provider.getBlockNumber();
    return Math.max(0, head - PROOF_BASE_BLOCK_DEPTH);
  }

  async function resolveProvingBlock(
    options?: PrivacySendOptions
  ): Promise<number> {
    const previous = await previousBlock();

    // The caller's block is used only if it already includes our last
    // transaction. An older one would prove against state that still shows the
    // notes it spent, which the pool rejects. Waiting for a later block instead
    // is safe: what the wait helpers check stays true as the chain grows.
    if (
      options?.provingBlockId !== undefined &&
      options.provingBlockId >= previous
    ) {
      return options.provingBlockId;
    }

    return waitForProvableBlock(
      binding.provider,
      previous,
      options?.wait ?? {}
    );
  }

  /**
   * @param callAndProof - The pool's `apply_actions` call and its proof, as
   *   returned by the builder's `execute()`. The fee withdrawal has to be among
   *   the actions already: the proof commits to them, so it cannot be amended
   *   here, and the paymaster rejects a proof without one (code 165).
   * @param parameters - The `parameters` of the quote whose fee this proof
   *   already commits to. Omitted only by the public {@link PrivacyClient.submit}
   *   entry point, which has no quote of its own and so fetches one.
   * @param invoke - Signed public calls, when the same quote wrapped any.
   */
  async function submit(
    callAndProof: CallAndProof,
    parameters?: unknown,
    invoke?: PrivacySignedInvoke
  ): Promise<PrivacySubmission> {
    try {
      const submission = await paymaster.execute(
        callAndProof.call,
        callAndProof.proof,
        // Echoed rather than rebuilt: `parameters` carry server-chosen fields
        // (tip, time bounds) that the paymaster expects back verbatim.
        parameters ?? (await quote()).parameters,
        invoke
      );
      lastSubmittedTxHash = submission.transactionHash;
      return submission;
    } catch (error) {
      // The pool nonce baked into a failed invocation is now stale. Clearing it
      // makes the *next* attempt clean.
      //
      // Not retried here, and a retry has to mean *re-proving*: the paymaster
      // remembers the calls it has seen, so re-submitting this same proof answers
      // `156 :: execution error Tx already sent` rather than trying again.
      // Proving is slow and spends prover budget, so whether to pay for it twice
      // is the caller's decision.
      transfers.invalidateProofNonceCache();
      throw error;
    }
  }

  return {
    transfers,
    user: transfers.user,
    discoverRequirement: (recipient, token) =>
      transfers.discoverRequirement(recipient, token),
    discoverNotes: (params) => transfers.discoverNotes(params),
    discoverChannels: (recipients, params) =>
      transfers.discoverChannels(recipients, params),
    simulate: (compose, options) => simulateOnce(compose, options),
    invalidateProofNonceCache: () => transfers.invalidateProofNonceCache(),
    quote,

    // Both entry points that write `lastSubmittedTxHash` go through the queue, so
    // a caller mixing the two still gets one proof at a time.
    submit: (callAndProof) => sequenced(() => submit(callAndProof)),

    send: (compose, options) => sequenced(() => sendOnce(compose, options)),
  };

  async function simulateOnce(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySimulation> {
    const relay = resolveInvoke(options?.invoke);
    const { feeAction } = await quote(relay?.invoke);

    // The block `send` would prove at, resolved without waiting for it. It has
    // to be resolved at all: the SDK discovers recipient channels and notes *at
    // the proving block*, so simulating against the chain head would report the
    // warnings of a different transaction than the one submitted — and a
    // recipient who registered within the last few blocks would pass here and
    // then fail proving with no channel context.
    //
    // Deliberately not `resolveProvingBlock`: that one waits for the previous
    // private transaction to age, and this call is documented as waiting for no
    // block and safe to run while a send is in flight. The cost is that a
    // simulation run inside that window sees a slightly older block than the
    // send will prove against.
    const provingBlockId =
      options?.provingBlockId ?? (await provableBlockNow());

    const {
      wait: _wait,
      invoke: _invoke,
      onWarnings: _onWarnings,
      ...sdkOptions
    } = options ?? {};
    const builder = transfers.build({
      autoSelectNotes: "naive",
      ...sdkOptions,
      provingBlockId,
      // Nothing built here is submitted, so a registry the caller passed is left
      // untouched and the copy is dropped.
      registryConst: true,
    });

    await compose(builder);
    appendFeeWithdrawal(builder, feeAction);

    const { warnings } = await builder.simulate({
      node: binding.provider,
    });
    return { warnings, feeAction };
  }

  async function sendOnce(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySendResult> {
    const relay = resolveInvoke(options?.invoke);
    const { feeAction, parameters, typedData } = await quote(relay?.invoke);

    // Signed here, before the wait and the proof, rather than after: the
    // signature does not depend on the proof, and asking for it first means a
    // user who declines has not already paid for proving. The typed data is
    // valid for a window the paymaster sets which comfortably outlasts the
    // block wait plus proving. If a chain ever slow enough to blow that
    // window turns up, the paymaster rejects the `execute` cleanly rather
    // than anything landing half-done.
    //
    // `typedData` is echoed exactly as received: the signature covers those
    // bytes, and the paymaster picks the nonce, so rebuilding it invalidates it.
    const signedInvoke: PrivacySignedInvoke | undefined =
      relay && typedData
        ? {
            userAddress: relay.invoke.userAddress,
            typedData,
            signature: await relay.signTypedData(typedData),
          }
        : undefined;

    const provingBlockId = await resolveProvingBlock(options);

    const {
      wait: _wait,
      invoke: _invoke,
      onWarnings: _onWarnings,
      ...sdkOptions
    } = options ?? {};
    const builder = transfers.build({
      // Defaulted because the fee withdrawal appended below is in the
      // paymaster's token, which the caller never has to name. Without a
      // selection strategy the builder finds no notes to pay it from and the
      // whole transaction fails for insufficient balance while the notes sit
      // there unused. Listed first so a caller can choose another strategy, and
      // notes named explicitly on the builder still win over both.
      autoSelectNotes: "naive",
      ...sdkOptions,
      provingBlockId,
      // Compiling resolves the private state this transaction will produce, and
      // it happens before the proof exists. So a caller who keeps a registry has
      // it written by attempts that go on to fail at proving or submission. This
      // compiles against a copy instead, returned below for the caller to adopt
      // once they are satisfied. Forced, not defaulted: the return value promises
      // their registry is untouched.
      registryConst: true,
    });

    await compose(builder);

    appendFeeWithdrawal(builder, feeAction);

    const { callAndProof, warnings, registry } = await builder.execute();

    // Reported rather than acted on. The SDK raises `USER_LINKAGE` for a
    // transaction that may connect the user's private and public identities,
    // and only the caller knows whether that is acceptable here.
    if (warnings.length > 0 && options?.onWarnings) {
      await options.onWarnings(warnings);
    }

    return {
      ...(await submit(callAndProof, parameters, signedInvoke)),
      registry,
    };
  }
}

/** Re-exported so callers can type a bound client without importing the SDK. */
export type { CallAndProof, PrivateRegistry, PrivateTransfersBuilder, Warning };
export type { Address };
