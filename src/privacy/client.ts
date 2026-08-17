import type { Call, RpcProvider, Signature, TypedData } from "starknet";
import type {
  CallAndProof,
  PrivateTransfersBuilder,
  PrivateTransfersInterface,
  ExecuteOptions as SdkExecuteOptions,
} from "@starkware-libs/starknet-privacy-sdk";

import type { Address } from "@/types";
import { fromAddress } from "@/types";
import {
  PrivacyPaymaster,
  type PrivacyFeeQuote,
  type PrivacyPaymasterConfig,
  type PrivacyInvoke,
  type PrivacySignedInvoke,
} from "@/privacy/paymaster";
import {
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
   * your configuration. `wallet.privacy()` wires this up; a client built by hand
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
  | "simulate"
  | "invalidateProofNonceCache"
> {
  /** The privacy SDK's own client, for anything this layer does not wrap. */
  readonly transfers: PrivateTransfersInterface;

  /**
   * What the next transaction will cost, before committing to a proof.
   *
   * Note this is *not* what `simulate` reports: the pool fee is a separate
   * withdrawal the paymaster requires, and `simulate` does not know about it.
   * Show this to users, not the simulated gas.
   */
  quote(): Promise<PrivacyFeeQuote>;

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
   * @returns The submitted transaction hash
   *
   * @example
   * ```ts
   * const hash = await privacy.send((b) =>
   *   b.with(STRK, (t) => t.transfer({ recipient: bob, amount })).surplusTo(me)
   * );
   * ```
   *
   * @example Deposit without a separate approve transaction
   * ```ts
   * const hash = await privacy.send(
   *   (b) => b.with(STRK, (t) => t.deposit({ amount })),
   *   { invoke: await wallet.tx().approve(STRK, poolAddress, amount).calls() }
   * );
   * ```
   */
  send(
    compose: (builder: PrivateTransfersBuilder) => unknown,
    options?: PrivacySendOptions
  ): Promise<string>;

  /**
   * Submit a proof you composed and generated yourself.
   *
   * The escape hatch for flows this layer does not model, like a private swap
   * built against {@link PrivacyClient.transfers}. You are responsible for
   * having included the fee withdrawal from {@link PrivacyClient.quote}. The
   * paymaster rejects a proof without it.
   *
   * @param callAndProof - The pool call and its proof
   * @returns The submitted transaction hash
   */
  submit(callAndProof: CallAndProof): Promise<string>;
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
 * `wallet.privacy()` returns an already-bound client; this is for code that
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
    ...(binding.fetch && { fetch: binding.fetch }),
  });
  const pool = fromAddress(binding.poolContractAddress);

  // Hash of this client's most recent submission. A proof must read pool state
  // that already includes it, otherwise the next transaction spends notes the
  // proof still believes are unspent, and the pool rejects it. Tracked here so
  // callers do not have to.
  let lastSubmittedTxHash: string | undefined;

  const quote = (invoke?: PrivacyInvoke): Promise<PrivacyFeeQuote> =>
    paymaster.quote(pool, binding.fee, {
      ...(binding.tip && { tip: binding.tip }),
      ...(invoke && { invoke }),
    });

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
          "for it. `wallet.privacy()` provides both; a client built with " +
          "`withPaymaster` has to pass `account: { address, signTypedData }`."
      );
    }
    return {
      invoke: { userAddress: account.address, calls },
      signTypedData: account.signTypedData,
    };
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
  ): Promise<string> {
    try {
      const hash = await paymaster.execute(
        callAndProof.call,
        callAndProof.proof,
        // Echoed rather than rebuilt: `parameters` carry server-chosen fields
        // (tip, time bounds) that the paymaster expects back verbatim.
        parameters ?? (await quote()).parameters,
        invoke
      );
      lastSubmittedTxHash = hash;
      return hash;
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
    simulate: (actions, options) => transfers.simulate(actions, options),
    invalidateProofNonceCache: () => transfers.invalidateProofNonceCache(),
    quote,
    submit,

    async send(compose, options) {
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

      const { wait: _wait, invoke: _invoke, ...sdkOptions } = options ?? {};
      // ProvingBlockId is starknet.js's BlockIdentifier, so a plain number is
      // the block-number form; `{ block_number: n }` is not accepted.
      const builder = transfers.build({
        ...sdkOptions,
        provingBlockId,
      });

      await compose(builder);

      // The forwarder collects its fee from this withdrawal, so a proof without
      // it is rejected (code 165). A zero amount means the deployment charges
      // nothing, and the withdrawal must then be omitted rather than sent as a
      // no-op transfer.
      if (feeAction.amount > 0n) {
        builder.with(feeAction.token, (t) =>
          t.withdraw({
            recipient: feeAction.recipient,
            amount: feeAction.amount,
          })
        );
      }

      const { callAndProof } = await builder.execute();
      return submit(callAndProof, parameters, signedInvoke);
    },
  };
}

/** Re-exported so callers can type a bound client without importing the SDK. */
export type { CallAndProof, PrivateTransfersBuilder };
export type { Address };
