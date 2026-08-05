import type { RpcProvider } from "starknet";
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
} from "@/privacy/paymaster";
import {
  waitForProvableBlock,
  type ProvableAttempt,
} from "@/privacy/sequencing";

/** Options for a single {@link PrivacyClient.send}. */
export interface PrivacySendOptions extends Omit<
  SdkExecuteOptions,
  "provingBlockId"
> {
  /**
   * Prove against this block instead of one resolved from the chain head.
   *
   * Only pass this if you are tracking provability yourself. The default
   * already waits for the previous private transaction from this client to age.
   */
  provingBlockId?: number;
  /**
   * Called on each poll while waiting for a block old enough to prove against.
   *
   * The wait is silent otherwise, and on a slow chain it is minutes long: ten
   * blocks is seconds on Sepolia but far longer on mainnet.
   */
  onWait?: (attempt: ProvableAttempt) => void;
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
   * @param compose - Adds the operations to perform
   * @param options - SDK execute options, plus proving-block overrides
   * @returns The submitted transaction hash
   *
   * @example
   * ```ts
   * const hash = await privacy.send((b) =>
   *   b.with(STRK, (t) => t.transfer({ recipient: bob, amount })).surplusTo(me)
   * );
   * ```
   */
  send(
    compose: (builder: PrivateTransfersBuilder) => void,
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
  const paymaster = new PrivacyPaymaster(binding.url);
  const pool = fromAddress(binding.poolContractAddress);

  // Hash of this client's most recent submission. A proof must read pool state
  // that already includes it, otherwise the next transaction spends notes the
  // proof still believes are unspent, and the pool rejects it. Tracked here so
  // callers do not have to.
  let lastSubmittedTxHash: string | undefined;

  const quote = (): Promise<PrivacyFeeQuote> =>
    paymaster.quote(pool, binding.fee, binding.tip);

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
    if (options?.provingBlockId !== undefined) return options.provingBlockId;

    return waitForProvableBlock(binding.provider, await previousBlock(), {
      ...(options?.onWait && { onAttempt: options.onWait }),
    });
  }

  /**
   * @param callAndProof - The pool's `apply_actions` call and its proof, as
   *   returned by the builder's `execute()`. The fee withdrawal has to be among
   *   the actions already: the proof commits to them, so it cannot be amended
   *   here, and the paymaster rejects a proof without one (code 165).
   * @param parameters - The `parameters` of the quote whose fee this proof
   *   already commits to. Omitted only by the public {@link PrivacyClient.submit}
   *   entry point, which has no quote of its own and so fetches one.
   */
  async function submit(
    callAndProof: CallAndProof,
    parameters?: unknown
  ): Promise<string> {
    try {
      const hash = await paymaster.execute(
        callAndProof.call,
        callAndProof.proof,
        // Echoed rather than rebuilt: `parameters` carry server-chosen fields
        // (tip, time bounds) that the paymaster expects back verbatim.
        parameters ?? (await quote()).parameters
      );
      lastSubmittedTxHash = hash;
      return hash;
    } catch (error) {
      // The pool nonce baked into a failed invocation is now stale. Clearing it
      // makes the *next* attempt clean. Not retried here: retrying means
      // re-proving, which is slow and costs prover budget, so that is the
      // caller's decision to make.
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
      const { feeAction, parameters } = await quote();
      const provingBlockId = await resolveProvingBlock(options);

      const { onWait: _onWait, ...sdkOptions } = options ?? {};
      // ProvingBlockId is starknet.js's BlockIdentifier, so a plain number is
      // the block-number form; `{ block_number: n }` is not accepted.
      const builder = transfers.build({
        ...sdkOptions,
        provingBlockId,
      });

      compose(builder);

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
      return submit(callAndProof, parameters);
    },
  };
}

/** Re-exported so callers can type a bound client without importing the SDK. */
export type { CallAndProof, PrivateTransfersBuilder };
export type { Address };
