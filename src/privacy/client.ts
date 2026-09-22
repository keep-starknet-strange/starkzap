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
  asFelt,
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
import { assertProofFresh } from "@/wallet/utils";

/** Options for a single {@link PrivacyClient.send}. */
export interface PrivacySendOptions extends Omit<
  SdkExecuteOptions,
  "provingBlockId"
> {
  /**
   * Prove against this block instead of the chain head.
   *
   * Use it when the proof depends on a recent event, such as a deposit that
   * just arrived. `waitForFundedBalance` returns such a block.
   *
   * This is a minimum. The client may use a later block, never an earlier one.
   */
  provingBlockId?: number;
  /**
   * Options for the wait before proving. Passed to
   * {@link waitForProvableBlock} unchanged.
   *
   * Set `onAttempt` to show progress. Without it, the wait is silent and can
   * take minutes. Change the poll settings only for a devnet or a test.
   */
  wait?: ProvableBlockOptions;
  /**
   * Public calls to include in the same transaction. The usual case is an
   * ERC20 `approve` before a deposit.
   *
   * These calls are not private. They name the account.
   *
   * Requires {@link PaymasterBinding.account} and an account with SNIP-9
   * support. `connectPrivacy` sets this up for you.
   *
   * Build the calls with `wallet.tx()`:
   *
   * ```ts
   * invoke: await wallet.tx().approve(STRK, poolAddress, amount).calls()
   * ```
   *
   * A deposit of funds that just arrived still needs
   * {@link PrivacySendOptions.provingBlockId}.
   */
  invoke?: Call[];
  /**
   * Called with the SDK's warnings before submission. Not called when there
   * are none.
   *
   * Expect `USER_LINKAGE`. It means the transaction may link the user's
   * private and public identities. You decide whether that is acceptable.
   *
   * The callback is awaited. Throw to abort. Return to submit. At this point
   * the proof is already paid for.
   *
   * To see the warnings before you pay, call {@link PrivacyClient.simulate}
   * with the same callback.
   */
  onWarnings?: (warnings: Warning[]) => unknown;
}

/** What a simulation reports about the transaction `send` would compose. */
export interface PrivacySimulation {
  /**
   * Warnings the SDK raises, `USER_LINKAGE` among them. The same list
   * {@link PrivacySendOptions.onWarnings} receives.
   */
  warnings: Warning[];
  /** The fee `send` would append, from a quote taken at the same moment. */
  feeAction: PrivacyFeeQuote["feeAction"];
}

/** What {@link PrivacyClient.send} reports about the transaction it submitted. */
export interface PrivacySendResult extends PrivacySubmission {
  /**
   * The private state after this transaction: notes, channels and scan
   * position.
   *
   * This is a copy. Your own registry is never changed. Adopt this copy when
   * the transaction has landed, or ignore it and let discovery rebuild the
   * state.
   */
  registry: PrivateRegistry;
}

/**
 * A privacy pool client that handles the fee, the proving block and the
 * submission.
 *
 * Everything else comes from the privacy SDK unchanged. For anything not
 * covered here, use {@link PrivacyClient.transfers}.
 *
 * The SDK's `execute`, `createProofInvocation` and `build` are not exposed.
 * They would let you skip the fee withdrawal. Use {@link PrivacyClient.send},
 * or build your own proof and pass it to {@link PrivacyClient.submit}.
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
   * The fee of the next transaction.
   *
   * Show this to users instead of a gas estimate. It is the amount that leaves
   * the shielded balance.
   */
  quote(): Promise<PrivacyFeeQuote>;

  /**
   * Run what {@link PrivacyClient.send} would run, without proving.
   *
   * It uses the same fee, the same withdrawal and the same proving block. So
   * the warnings it reports are the ones the real transaction would raise.
   *
   * It is cheap and safe to call while a send is in flight. It waits for no
   * block and writes no private state.
   *
   * @param compose - Adds the operations to simulate, as for `send`
   * @param options - The options for `send`
   * @returns The warnings, and the fee the real send would withdraw
   */
  simulate(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySimulation>;

  /**
   * Compose, prove and submit one private transaction.
   *
   * The callback receives the privacy SDK's builder. Use it as the SDK
   * documents. This method adds the fee withdrawal, waits for a provable
   * block, proves, and submits through the relayer. The account never appears
   * on-chain, unless you pass `invoke`.
   *
   * Pass {@link PrivacySendOptions.invoke} to include public calls, such as an
   * `approve` before a deposit. Those calls name the account on-chain.
   *
   * The callback can be `async`. It may return the builder, so its return type
   * is `unknown`.
   *
   * @param compose - Adds the operations to perform
   * @param options - SDK execute options, proving-block overrides and public
   *   calls to relay
   * @returns The transaction hash, the relayer's tracking id when it gave one,
   *   and the private state after the transaction. Record the tracking id
   *   now. Nothing can look it up later.
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
   * Submit a proof you built yourself, for example a private swap built
   * against {@link PrivacyClient.transfers}.
   *
   * The proof must include the fee withdrawal from
   * {@link PrivacyClient.quote}. The paymaster rejects a proof without it.
   *
   * An expired proof is refused here, before it is sent.
   *
   * @param callAndProof - The pool call and its proof
   * @returns The transaction hash, and the relayer's tracking id when it gave one
   */
  submit(callAndProof: CallAndProof): Promise<PrivacySubmission>;
}

/**
 * What {@link withPaymaster} needs: a {@link PrivacyPaymasterConfig}, plus the
 * pool, provider, chain and account.
 */
export interface PaymasterBinding extends PrivacyPaymasterConfig {
  /** Pool the client is bound to. */
  poolContractAddress: string;
  /** Provider used to read the chain head when resolving the proving block. */
  provider: RpcProvider;
  /** Accept a plain `http://` `url` on a non-loopback host. See `PrivacyConfig.allowInsecureHttp`. */
  allowInsecureHttp?: boolean;
  /** Chain this client is bound to. Typed data from the paymaster must match it. */
  chainId: ChainId;
  /**
   * The account behind the client. Needed only for
   * {@link PrivacySendOptions.invoke}.
   *
   * Private transactions do not need it. The proof alone authorises them.
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
 * `connectPrivacy` does this for you. Use this function when you called
 * {@link createPrivacy} directly.
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
    maxFee: binding.maxFee,
    allowedFeeRecipients: binding.allowedFeeRecipients,
    ...(binding.fetch && { fetch: binding.fetch }),
    ...(binding.timeoutMs !== undefined && { timeoutMs: binding.timeoutMs }),
    ...(binding.allowInsecureHttp && { allowInsecureHttp: true }),
  });
  const pool = fromAddress(binding.poolContractAddress);

  // Hash of this client's last submission. The next proof must read pool state
  // that includes it, or the pool rejects it.
  let lastSubmittedTxHash: string | undefined;

  // Resolves when all queued work has finished.
  let queue: Promise<void> = Promise.resolve();

  /**
   * Run one build-prove-submit at a time.
   *
   * One client cannot build two proofs at once. They would share the SDK's
   * cached pool nonce and the proving checkpoint, and one would fail.
   *
   * `submit` is queued too. A failed submit clears the nonce cache, which
   * would break a proof in progress.
   *
   * The scope is one client, so one account and one pool. Reads are not
   * queued. A page reload loses the queue.
   */
  function sequenced<T>(work: () => Promise<T>): Promise<T> {
    // Wait for the queue, then become the next item in it.
    const result = queue.then(work);
    // Track completion, not success. A failed send must not block the next one.
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /**
   * Refuse a sponsored fee larger than the one the pool publishes on chain.
   *
   * Only `sponsored` mode has a published figure to compare against. The
   * other modes include gas or a token conversion the pool does not know.
   *
   * A quote below the published fee is accepted. The pool refuses it itself.
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
      const amount = asFelt(value);
      if (amount === undefined) {
        throw new Error(
          `the pool answered with ${JSON.stringify(value)}, which is not a fee`
        );
      }
      published = amount;
    } catch (error) {
      // A warning, not an error. This is only a second check on the fee.
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
   * Checked before quoting, so a client with no signer fails at once.
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
   * The paymaster rejects a proof without it (code 165). A zero fee adds no
   * action.
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
  async function previousBlock(wait?: ProvableBlockOptions): Promise<number> {
    if (lastSubmittedTxHash === undefined) return -1;

    // Bounded. The relayer may return a hash it never broadcasts, and later
    // sends queue behind this wait. Use the same budget as the block wait.
    const pollIntervalMs = wait?.pollIntervalMs ?? 2_000;
    const timeoutMs = wait?.timeoutMs ?? 300_000;

    // `errorStates: []` so a reverted previous transaction does not fail this
    // send. It still occupies a block.
    const receipt = await binding.provider.waitForTransaction(
      lastSubmittedTxHash,
      {
        errorStates: [],
        retryInterval: pollIntervalMs,
        retries: Math.max(1, Math.ceil(timeoutMs / pollIntervalMs)),
      }
    );
    return receipt.isError() ? -1 : receipt.block_number;
  }

  /**
   * The block a proof would use right now. One chain-head read, no waiting.
   * Never below 0.
   */
  async function provableBlockNow(): Promise<number> {
    const head = await binding.provider.getBlockNumber();
    return Math.max(0, head - PROOF_BASE_BLOCK_DEPTH);
  }

  async function resolveProvingBlock(
    options?: PrivacySendOptions
  ): Promise<number> {
    const previous = await previousBlock(options?.wait);

    // Use the caller's block only if it already includes our last transaction.
    // Otherwise wait for a later block.
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
   * @param callAndProof - The pool call and its proof, from the builder's
   *   `execute()`. It must already include the fee withdrawal.
   * @param parameters - The `parameters` of the quote this proof commits to.
   *   Omitted only by the public {@link PrivacyClient.submit}, which fetches a
   *   fresh quote.
   * @param invoke - Signed public calls, when the quote wrapped any.
   */
  async function submit(
    callAndProof: CallAndProof,
    parameters?: unknown,
    invoke?: PrivacySignedInvoke
  ): Promise<PrivacySubmission> {
    await assertProofFresh(
      callAndProof.proof,
      binding.provider,
      PROOF_BASE_BLOCK_DEPTH,
      pool
    );

    try {
      const submission = await paymaster.execute(
        callAndProof.call,
        callAndProof.proof,
        // Sent back unchanged. `parameters` carry fields the paymaster chose,
        // such as tip and time bounds.
        parameters ?? (await quote()).parameters,
        invoke
      );
      lastSubmittedTxHash = submission.transactionHash;
      return submission;
    } catch (error) {
      // The pool nonce in the failed invocation is now stale. Clear it so the
      // next attempt is clean.
      //
      // No retry here. The paymaster remembers this proof, so a retry must
      // re-prove. That is slow and costs prover budget, so the caller decides.
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

    // Both writers of `lastSubmittedTxHash` go through the queue.
    submit: (callAndProof) => sequenced(() => submit(callAndProof)),

    send: (compose, options) => sequenced(() => sendOnce(compose, options)),
  };

  async function simulateOnce(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySimulation> {
    const relay = resolveInvoke(options?.invoke);
    const { feeAction } = await quote(relay?.invoke);

    // Resolve the block `send` would prove at, without waiting for it. The SDK
    // discovers channels and notes at that block, so the chain head would give
    // the wrong warnings.
    //
    // Not `resolveProvingBlock`. That one waits for the previous transaction,
    // and this call must not wait.
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
      // Nothing is submitted, so the caller's registry stays untouched.
      registryConst: true,
    });

    await compose(builder);
    appendFeeWithdrawal(builder, feeAction);

    const { warnings } = await builder.simulate({
      node: binding.provider,
    });

    // Same callback as `send`. Here the warnings arrive before anything is paid
    // for. They are also returned.
    if (warnings.length > 0 && options?.onWarnings) {
      await options.onWarnings(warnings);
    }

    return { warnings, feeAction };
  }

  async function sendOnce(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<PrivacySendResult> {
    const relay = resolveInvoke(options?.invoke);
    const { feeAction, parameters, typedData } = await quote(relay?.invoke);

    // Sign before the wait and the proof. A user who declines has then paid
    // nothing. The typed data stays valid long enough for the wait and the
    // proving. If it expires, the paymaster rejects the `execute`.
    //
    // `typedData` is sent back unchanged. The signature covers those exact
    // bytes.
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
      // The fee withdrawal below is in the paymaster's token. Without a
      // selection strategy the builder finds no notes to pay it. Listed first,
      // so the caller can override it.
      autoSelectNotes: "naive",
      ...sdkOptions,
      provingBlockId,
      // Compile against a copy of the registry. A failed attempt then never
      // writes to the caller's registry. The copy is returned below.
      registryConst: true,
    });

    await compose(builder);

    appendFeeWithdrawal(builder, feeAction);

    const { callAndProof, warnings, registry } = await builder.execute();

    // The SDK's clone drops the discovery cursor. Without it, a caller who
    // adopts this registry would rescan from genesis. Carry the caller's cursor
    // over when this run did not set a newer one.
    if (
      registry.cursor === undefined &&
      options?.registry?.cursor !== undefined
    ) {
      registry.cursor = options.registry.cursor;
    }

    // Reported, not acted on. Only the caller knows whether a `USER_LINKAGE`
    // warning is acceptable.
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
