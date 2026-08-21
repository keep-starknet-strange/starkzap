import { CallData, hash, num, shortString } from "starknet";
import type { Call, Signature, TypedData } from "starknet";
import { fromAddress, type Address } from "@/types";
import { assertSafeHttpUrl } from "@/utils";

/**
 * How the fee for a private transaction is paid.
 *
 * Every mode is submitted by the paymaster's relayer through the forwarder, so
 * the user's account never appears on-chain. What differs is who fronts the gas
 * and which token the fee comes out of. In all three the fee is withdrawn
 * from the *shielded* balance, never from a public account.
 *
 * - `default` — the user pays gas and the pool fee from their private balance,
 *   in `gasToken`. The withdrawal is sized at the paymaster's *suggested
 *   maximum* rather than its estimate, so it covers headroom that may go
 *   unused. Needs no paymaster API key, which makes it the only mode that works
 *   without an integrator account.
 * - `sponsored` — the relayer fronts the gas. The user pays a pool fee the
 *   paymaster deployment sets, in the token that deployment chooses. Requires
 *   an API key.
 * - `sponsored_private` — as `sponsored`, but the user chooses the token the
 *   pool fee is denominated in. Requires an API key. Only valid for private
 *   transactions.
 *
 * Which mode costs less depends on the deployment, the network and current gas,
 * none of which are fixed. {@link PrivacyPaymaster.quote} is the only
 * authority: its `feeAction` names the amount and the token actually required.
 */
export type PrivacyFeeMode =
  | { mode: "default"; gasToken: Address }
  | { mode: "sponsored" }
  | { mode: "sponsored_private"; poolFeeToken: Address };

/**
 * Transaction priority. AVNU's build API documents `slow | normal | fast`, and
 * fills in `normal` when it is omitted.
 */
export type PrivacyTip = "slow" | "normal" | "fast";

/**
 * Where and how to submit private transactions.
 *
 * Present or absent as a unit. Submission needs an endpoint *and* a fee mode,
 * so pairing them in one object puts that requirement in the type: neither
 * {@link withPaymaster} nor `connectPrivacy` can be handed half a
 * configuration, and the check happens at compile time rather than as a throw
 * on first use.
 *
 * Omit the whole object to compose and prove with `createPrivacy` and submit
 * through your own infrastructure.
 */
export interface PrivacyPaymasterConfig {
  /**
   * Paymaster endpoint.
   *
   * Point this at a proxy that holds the API key rather than at the paymaster
   * itself: `sponsored` and `sponsored_private` need one. `default` mode needs
   * no key at all, so it can address the paymaster directly.
   */
  url: string;
  /**
   * How the fee is paid. Deliberately never defaulted.
   *
   * `default` mode is the tempting choice, being the only one that works
   * without an API key, but its withdrawal takes the paymaster's suggested
   * *maximum* gas rather than the estimate, so the user pays for headroom they
   * may not use. {@link PrivacyPaymaster.quote} reports both figures.
   *
   * Every mode withdraws from the shielded balance and is submitted by the
   * relayer, so the choice is about cost, not about privacy.
   */
  fee: PrivacyFeeMode;
  /** Transaction priority. Omit to let the paymaster choose. */
  tip?: PrivacyTip;
  /**
   * Transport for paymaster requests. Defaults to the global `fetch`.
   *
   * The reason to point {@link PrivacyPaymasterConfig.url} at a proxy is that the
   * proxy holds the API key instead of the browser — which makes the proxy itself
   * something worth gating, and gating it needs a credential this client would
   * otherwise have no way to send.
   *
   * Wrap `fetch` and the whole question moves to where it belongs: the caller.
   * Auth headers, a bearer token refreshed per call, `credentials: "include"` for
   * a cross-origin session, retries and backoff, a timeout via `AbortSignal`,
   * tracing headers, a custom agent or proxy — all of it composes here, and none
   * of it needs a field of its own.
   *
   * ```ts
   * paymaster: {
   *   url: PROXY_URL,
   *   fee: { mode: "sponsored" },
   *   fetch: (input, init) =>
   *     globalThis.fetch(input, {
   *       ...init,
   *       headers: { ...init?.headers, Authorization: `Bearer ${await token()}` },
   *     }),
   * }
   * ```
   *
   * Called as `fetch(url, init)` and must resolve to a `Response`. So a wrapper
   * adds transport behaviour without taking over error handling.
   */
  fetch?: typeof fetch;
  /**
   * Give up on a paymaster request after this many milliseconds.
   *
   * Defaults to two minutes. The ceiling has to cover an `execute`, whose body
   * is the whole proof, so it is generous rather than tight. Its job is to stop
   * a hung endpoint from stalling the client forever, not to enforce latency.
   *
   * A {@link PrivacyPaymasterConfig.fetch} wrapper that sets its own `signal`
   * overrides this.
   */
  timeoutMs?: number;
  /**
   * Refuse a quote whose fee exceeds this, in base units of the fee token.
   *
   * The paymaster's response decides how much of the shielded balance leaves the
   * pool: {@link PrivacyClient.send} appends the withdrawal it names, and the
   * proof then commits to it. A ceiling is the only thing standing between a
   * misconfigured or compromised endpoint and the caller's balance.
   *
   * Which token the amount is denominated in depends on the mode — `default` and
   * `sponsored_private` take the token you chose, `sponsored` takes whichever the
   * deployment picked — so the rejection names the token alongside the amount.
   *
   * Left unset by default: the right ceiling depends on what an integrator
   * considers a reasonable fee, and guessing one would break every deployment
   * whose fee happens to sit above the guess.
   */
  maxFee?: bigint;
  /**
   * Fee recipients to accept. A quote naming any other is refused.
   *
   * Nothing on chain says which recipient is legitimate. The pool's own
   * `get_fee_collector()` is a different address that the forwarder pays onward,
   * so this is the only way to bind the recipient to something the endpoint does
   * not control.
   *
   * Setting it also makes the caller check on the typed data mean something. That
   * check compares the signature's caller against this recipient, and both arrive
   * in the same response, so until one side is anchored here it catches a mismatch
   * rather than a substitution.
   *
   * Left unset by default: the address is per deployment and per network, and an
   * operator rotating it would break every transaction until this is updated.
   */
  allowedFeeRecipients?: readonly Address[];
}

/**
 * User calls to relay alongside the pool action, as `invoke_and_apply_action`.
 *
 * The paymaster's plain `apply_action` carries the pool call and nothing else, so
 * anything the caller needs beside it, like the ERC20 `approve` a deposit needs,
 * most often has to be its own transaction paid for and signed by the user in
 * public. Wrapping it here puts it in the same relayed transaction instead.
 *
 * The account must support SNIP-9 outside execution, since that is how the
 * relayer submits the call on its behalf. That is a property of the user's
 * account rather than of your configuration, so it can hold for one wallet and
 * not another. {@link PrivacyPaymaster.quote} names the failure when it does not.
 */
export interface PrivacyInvoke {
  /** Account the calls belong to, and whose `execute_from_outside` runs them. */
  userAddress: Address;
  /** Calls to relay. Converted to the paymaster's `to`/`selector` shape. */
  calls: Call[];
  /**
   * Chain the signature must be bound to, as a literal like `SN_SEPOLIA` or a
   * felt. Required, because the account computes its message hash from the chain
   * it is running on: typed data naming a different one produces a signature that
   * fails here and stays valid on that other chain, where the same account
   * address usually exists too.
   */
  chainId: string;
}

/**
 * The same calls, authorised.
 *
 * `quote()` returns SNIP-12 `typedData` for a {@link PrivacyInvoke}; the user
 * signs it, and both travel back on {@link PrivacyPaymaster.execute}. Echo the
 * typed data as it was given rather than rebuilding it. The signature covers
 * those exact bytes.
 */
export interface PrivacySignedInvoke {
  /** Same account the quote was built for. */
  userAddress: Address;
  /** The typed data from the quote, unchanged. */
  typedData: TypedData;
  /** The user's signature over it. */
  signature: Signature;
}

/** Options for {@link PrivacyPaymaster.quote}. */
export interface PrivacyQuoteOptions {
  /** Transaction priority. Omit to let the paymaster choose. */
  tip?: PrivacyTip;
  /** User calls to relay with the pool action. Omit for a pool action alone. */
  invoke?: PrivacyInvoke;
}

/** The withdrawal a proof must include so the forwarder is reimbursed. */
export interface PrivacyFeeAction {
  /** Forwarder address that must receive the fee. */
  recipient: Address;
  /** Token the fee is paid in. */
  token: Address;
  /** Amount to withdraw, in base units. Zero means no withdrawal is needed. */
  amount: bigint;
}

/**
 * What the paymaster reckons the *gas* will cost, alongside the fee.
 *
 * Gas, not your fee — the two coincide only in `default` mode, where the
 * withdrawal is sized at `suggestedMaxInGasToken`. Under the sponsored modes the
 * relayer pays the gas and the withdrawal is a separate flat pool fee, so these
 * figures are informational there.
 *
 * The pair worth showing a user is the estimate against the suggested maximum:
 * the gap is headroom they pay for and may not use, and it is wide.
 */
export interface PrivacyGasQuote {
  /** What the paymaster expects the transaction to cost, in STRK. */
  estimatedInStrk: bigint;
  /** The upper bound it charges against instead of the estimate, in STRK. */
  suggestedMaxInStrk: bigint;
  /** The same estimate, in the gas token chosen for `default` mode. */
  estimatedInGasToken: bigint;
  /** The same upper bound, in that gas token. This is what `default` withdraws. */
  suggestedMaxInGasToken: bigint;
  /** What the paymaster valued one gas token at, in STRK. */
  gasTokenPriceInStrk: bigint;
}

/**
 * What a submission produced.
 *
 * `trackingId` is the relayer's own reference and is optional — a deployment need
 * not give one. Record it if you have anywhere to record it: nothing can look one
 * up afterwards, so the response that carried it is the only chance to keep it.
 */
export interface PrivacySubmission {
  /** Hash of the submitted transaction. */
  transactionHash: string;
  /** The relayer's reference for this submission, when it returned one. */
  trackingId?: string;
}

/** What the build step returns. */
export interface PrivacyFeeQuote {
  /** The withdrawal to append to the proof's action list. */
  feeAction: PrivacyFeeAction;
  /**
   * Gas figures from the same response, or `undefined` when the deployment
   * omits them or reports them in a shape this cannot read.
   *
   * Never fatal: these are for display, so a malformed figure loses the display
   * rather than the transaction.
   */
  gas?: PrivacyGasQuote;
  /**
   * SNIP-12 data the user must sign, present only when the quote was built with
   * {@link PrivacyQuoteOptions.invoke}.
   *
   * Sign it, then pass it back with the signature as a
   * {@link PrivacySignedInvoke} on {@link PrivacyPaymaster.execute}.
   */
  typedData?: TypedData;
  /**
   * Execution parameters to hand back to {@link PrivacyPaymaster.execute}
   * verbatim. The spec says to echo these rather than rebuild them, so a
   * tracking or nonce field the service adds is not silently dropped.
   */
  parameters: unknown;
}

/**
 * Advice to append to a rejection, for the codes whose fix lies on *this* side
 * of the boundary — the paymaster cannot know about `quote()`.
 *
 * Keyed by method, because the same number means different things on the two
 * calls: AVNU's `168` is a fee-mode error when building and a missing proof
 * when executing. Nothing here restates or replaces what the paymaster said;
 * its own wording is always reported verbatim.
 *
 * Deliberately tiny. Writing a sentence for a code whose meaning was assumed
 * rather than checked is how this map previously came to describe rejections
 * that AVNU does not emit at all.
 */
const REMEDIES: Record<string, Record<number, string>> = {
  paymaster_executeTransaction: {
    // MISSING_FEE_TRANSFER_TO
    165: "Append the `feeAction` from `quote()` as a withdrawal before proving.",
    // POOL_FEE_TOO_LOW
    167: "The pool fee moved after this proof was built — quote and prove again.",
  },
};

/** JSON-RPC error body, as returned by the paymaster. */
interface RpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

function isRpcErrorBody(value: unknown): value is RpcErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "number"
  );
}

/**
 * The human-readable reason out of a JSON-RPC error's `data`.
 *
 * The paymaster's `message` is only ever the error's name, e.g. `An error
 * occurred (TRANSACTION_EXECUTION_ERROR)`. What actually went wrong is in
 * `data`, either as a bare string (`"x-paymaster-api-key is invalid"`) or
 * wrapped for SNIP-29's execution errors (`{ execution_error: "privacy pool
 * address is not whitelisted" }`). Reading only the string form drops the
 * sentence that names the most common misconfiguration.
 */
function reasonFrom(data: unknown): string | undefined {
  if (typeof data === "string") return data || undefined;
  if (typeof data !== "object" || data === null) return undefined;

  const { execution_error: reason } = data as { execution_error?: unknown };
  return typeof reason === "string" && reason ? reason : undefined;
}

/**
 * Error thrown when the paymaster rejects a request.
 *
 * `message` is the paymaster's own, with the reason from its `data` appended.
 * `code` and `data` are passed through untouched so callers can branch.
 *
 * Branch on the *method and code together*, not the number alone: the
 * privacy-specific codes are AVNU's rather than SNIP-29's, and the same number
 * carries different meanings across `paymaster_buildTransaction` and
 * `paymaster_executeTransaction`.
 */
export class PrivacyPaymasterError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
    this.name = "PrivacyPaymasterError";
  }
}

/**
 * The paymaster's call shape, which names the selector rather than the entrypoint.
 *
 * Calldata is compiled and hex-encoded rather than passed through. `CallData`
 * emits *decimal* felt strings, which is what every call built by `wallet.tx()`
 * or the ERC20 helpers carries, and the paymaster rejects a felt without an `0x`
 * prefix outright (`-32602 Invalid params`). Compiling first also accepts the
 * object form of `calldata`, so a hand-written call works either way.
 */
function toPaymasterCall(call: Call) {
  return {
    // Passed through, not normalised: addresses reach here already 0x-prefixed
    // via `fromAddress`, and `num.toHex` would strip their padding for no gain.
    to: call.contractAddress,
    selector: hash.getSelectorFromName(call.entrypoint),
    calldata: CallData.compile(call.calldata ?? []).map((felt) =>
      num.toHex(felt)
    ),
  };
}

/**
 * Name the one failure `invoke_and_apply_action` has that `apply_action` does not.
 *
 * Wrapping a user call means the relayer submits it through the account's own
 * `execute_from_outside`, so the account has to support SNIP-9 outside execution.
 * An account that does not (or an address that is not a deployed account at all)
 * is refused at build time with code `156` and the reason `invalid version`, which
 * reads as a version-negotiation bug in this client rather than as a fact about
 * the account.
 */
function explainInvokeRejection(
  error: unknown,
  invoke: PrivacyInvoke
): unknown {
  if (
    error instanceof PrivacyPaymasterError &&
    error.code === 156 &&
    reasonFrom(error.data) === "invalid version"
  ) {
    return new PrivacyPaymasterError(
      error.code,
      `[starkzap] The paymaster will not relay calls for ${invoke.userAddress}: ` +
        "the account does not support outside execution (SNIP-9), which is how " +
        "`invoke_and_apply_action` submits them on its behalf. Send those calls " +
        "as their own transaction and quote without `invoke` instead.",
      error.data
    );
  }
  return error;
}

/**
 * Read a felt, or `undefined` when the value is not one.
 *
 * `num.isBigNumberish` does the validating because it is stricter than `BigInt`:
 * `BigInt("")` and `BigInt(" ")` both return zero, which would let a blank field
 * compare equal to `0x0`. The catch covers `"0x"`, which passes the guard and
 * then fails to convert.
 */
function asFelt(value: unknown): bigint | undefined {
  if (!num.isBigNumberish(value)) return undefined;
  try {
    return num.toBigInt(value);
  } catch {
    return undefined;
  }
}

/** Read a chain id, which arrives as a short string but may be a felt. */
function asChainId(value: unknown): bigint | undefined {
  const felt = asFelt(value);
  if (felt !== undefined) return felt;
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return BigInt(shortString.encodeShortString(value));
  } catch {
    return undefined;
  }
}

/** Compare two felts by value, so padding and radix do not matter. */
function sameFelt(a: unknown, b: unknown): boolean {
  const left = asFelt(a);
  return left !== undefined && left === asFelt(b);
}

/**
 * Check what the paymaster asked the user to sign against what was requested.
 *
 * The response decides what the account will execute, so signing it unread lets a
 * compromised or misconfigured endpoint swap the calls, redirect the execution to
 * a different caller, or widen the validity window. A type assertion on the
 * response is not a check: these are.
 *
 * The chain is deliberately absent. An endpoint pointed at the wrong network
 * fails earlier and more clearly, when the paymaster refuses a pool it does not
 * know with code 156.
 */
function assertSignableTypedData(
  typedData: TypedData,
  invoke: PrivacyInvoke,
  forwarder: Address
): void {
  const reject = (why: string): never => {
    throw new PrivacyPaymasterError(
      -1,
      "[starkzap] The privacy paymaster asked for a signature over something " +
        `other than the requested transaction: ${why}. Nothing was signed.`,
      typedData
    );
  };

  if (typedData.primaryType !== "OutsideExecution") {
    reject(
      `the primary type is "${String(typedData.primaryType)}", not "OutsideExecution"`
    );
  }

  const domain = (typedData.domain ?? {}) as Record<string, unknown>;
  const wanted = asChainId(invoke.chainId);
  if (wanted === undefined || asChainId(domain.chainId) !== wanted) {
    reject(
      `it is bound to chain ${String(domain.chainId)}, not ${invoke.chainId}`
    );
  }

  const message = (typedData.message ?? {}) as Record<string, unknown>;

  // The forwarder collecting the fee is the only address allowed to relay these
  // calls, so another caller means the signature authorises someone else's use of
  // it. Both values come from this same response, so on its own this catches a
  // mismatch rather than a substitution. `allowedFeeRecipients` anchors the
  // recipient to configuration, which is what makes this check a real one.
  if (!sameFelt(message.Caller, forwarder)) {
    reject(
      `the caller is ${String(message.Caller)}, not the forwarder ${forwarder} ` +
        "that collects the fee"
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));

  // An outside execution with no upper bound is an authorisation that never
  // expires, so an unreadable one is refused rather than skipped.
  const before = asFelt(message["Execute Before"]);
  if (before === undefined) {
    reject(
      `it has no readable \`Execute Before\`, so the signature would never expire`
    );
  } else if (before <= now) {
    reject(`it expired at ${before}, and the clock now reads ${now}`);
  }

  const after = asFelt(message["Execute After"]);
  if (after !== undefined && after > now) {
    reject(`it cannot be used until ${after}, and the clock now reads ${now}`);
  }

  const calls = message.Calls;
  if (!Array.isArray(calls) || calls.length !== invoke.calls.length) {
    reject(
      `it carries ${Array.isArray(calls) ? calls.length : "no"} calls, not the ` +
        `${invoke.calls.length} requested`
    );
    return;
  }

  invoke.calls.forEach((call, index) => {
    // Compared against the same conversion the request used, so a difference is a
    // real difference rather than one of formatting.
    const expected = toPaymasterCall(call);
    const actual = (calls[index] ?? {}) as Record<string, unknown>;

    if (!sameFelt(actual.To, expected.to)) {
      reject(
        `call ${index} targets ${String(actual.To)} instead of ${expected.to}`
      );
    }
    if (!sameFelt(actual.Selector, expected.selector)) {
      reject(
        `call ${index} runs selector ${String(actual.Selector)} instead of ` +
          `${expected.selector} (\`${call.entrypoint}\`)`
      );
    }

    const calldata = actual.Calldata;
    if (
      !Array.isArray(calldata) ||
      calldata.length !== expected.calldata.length
    ) {
      reject(
        `call ${index} carries ${Array.isArray(calldata) ? calldata.length : "no"} ` +
          `calldata felts, not the ${expected.calldata.length} requested`
      );
      return;
    }
    expected.calldata.forEach((felt, position) => {
      if (!sameFelt(calldata[position], felt)) {
        reject(
          `call ${index} calldata differs at position ${position}: ` +
            `${String(calldata[position])} instead of ${felt}`
        );
      }
    });
  });
}

/**
 * Read the paymaster's fee action, validating rather than trusting it.
 *
 * This is a trust boundary. The response decides which address receives how much
 * of the caller's shielded balance, and the proof then commits to it — so the
 * addresses go through `fromAddress` like every other address in starkzap, and a
 * malformed amount is named here instead of surfacing as a bare BigInt
 * `SyntaxError` from inside a quote.
 */
/** Caller-declared bounds on what a quote may claim about its fee. */
interface FeeActionPolicy {
  maxFee?: bigint;
  allowedFeeRecipients?: readonly Address[];
}

function parseFeeAction(
  action: { recipient: string; token: string; amount: string },
  feeMode: PrivacyFeeMode,
  policy: FeeActionPolicy
): PrivacyFeeAction {
  let feeAction: PrivacyFeeAction;
  try {
    feeAction = {
      recipient: fromAddress(action.recipient),
      token: fromAddress(action.token),
      amount: BigInt(action.amount),
    };
  } catch (error) {
    throw new PrivacyPaymasterError(
      -1,
      "[starkzap] The privacy paymaster returned a fee action starkzap cannot " +
        `use: ${error instanceof Error ? error.message : String(error)}`,
      action
    );
  }

  const { allowedFeeRecipients, maxFee } = policy;

  if (allowedFeeRecipients !== undefined) {
    if (allowedFeeRecipients.length === 0) {
      throw new PrivacyPaymasterError(
        -1,
        "[starkzap] `allowedFeeRecipients` is an empty list, so no quote can be " +
          "accepted. Name the fee recipients you trust, or leave it unset.",
        action
      );
    }
    if (
      !allowedFeeRecipients.some((allowed) =>
        sameFelt(feeAction.recipient, allowed)
      )
    ) {
      throw new PrivacyPaymasterError(
        -1,
        `[starkzap] The privacy paymaster wants its fee sent to ` +
          `${feeAction.recipient}, which is not in \`allowedFeeRecipients\`. ` +
          "Nothing was withdrawn.",
        action
      );
    }
  }

  // The token is ours to check in the two modes where we name it. Under
  // `sponsored` the deployment picks the token, so there is nothing to compare
  // against and `maxFee` is the only bound on what leaves the pool.
  const chosenToken =
    feeMode.mode === "default"
      ? feeMode.gasToken
      : feeMode.mode === "sponsored_private"
        ? feeMode.poolFeeToken
        : undefined;

  if (chosenToken !== undefined && !sameFelt(feeAction.token, chosenToken)) {
    throw new PrivacyPaymasterError(
      -1,
      `[starkzap] The privacy paymaster quoted its fee in ${feeAction.token}, ` +
        `but \`${feeMode.mode}\` mode was configured to pay in ${chosenToken}. ` +
        "Nothing was withdrawn. A proof built on this quote would spend a token " +
        "you did not choose.",
      action
    );
  }

  if (maxFee !== undefined && feeAction.amount > maxFee) {
    throw new PrivacyPaymasterError(
      -1,
      `[starkzap] The privacy paymaster quoted a fee of ${feeAction.amount} ` +
        `base units of ${feeAction.token}, above the ${maxFee} ceiling set by ` +
        "`privacy.paymaster.maxFee`. Nothing was withdrawn. Raise the ceiling if " +
        "this is the going rate, or check that the endpoint is the one you meant.",
      action
    );
  }

  return feeAction;
}

/**
 * Read the gas block, or give up on it quietly.
 *
 * Display-only, so a deployment that omits it or words it differently costs the
 * figures and nothing else. Throwing here would fail a transaction over a number
 * that was never going to be spent.
 */
function parseGasQuote(fee: unknown): PrivacyGasQuote | undefined {
  if (typeof fee !== "object" || fee === null) return undefined;

  const raw = fee as Record<string, unknown>;
  const felt = (key: string): bigint | undefined => {
    const value = raw[key];
    if (typeof value !== "string" && typeof value !== "number")
      return undefined;
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  };

  const estimatedInStrk = felt("estimated_fee_in_strk");
  const suggestedMaxInStrk = felt("suggested_max_fee_in_strk");
  const estimatedInGasToken = felt("estimated_fee_in_gas_token");
  const suggestedMaxInGasToken = felt("suggested_max_fee_in_gas_token");
  const gasTokenPriceInStrk = felt("gas_token_price_in_strk");

  if (
    estimatedInStrk === undefined ||
    suggestedMaxInStrk === undefined ||
    estimatedInGasToken === undefined ||
    suggestedMaxInGasToken === undefined ||
    gasTokenPriceInStrk === undefined
  ) {
    return undefined;
  }

  return {
    estimatedInStrk,
    suggestedMaxInStrk,
    estimatedInGasToken,
    suggestedMaxInGasToken,
    gasTokenPriceInStrk,
  };
}

/**
 * Default ceiling on a single paymaster request.
 *
 * Sized for `paymaster_executeTransaction`, which uploads the whole proof and is
 * megabytes on a link the SDK does not choose.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Minimal client for a privacy-capable paymaster.
 *
 * The privacy transaction types (`apply_action`) are not part of SNIP-29, so
 * starknet.js's `PaymasterRpc` cannot express them. Its executable transaction
 * union has no field for a proof. This talks to the paymaster's JSON-RPC
 * endpoint directly instead.
 *
 * `@avnu/avnu-sdk` covers some of the same ground, and the shapes here —
 * {@link PrivacyTip}, {@link PrivacyFeeAction} — deliberately mirror it rather
 * than import from it. It is an optional peer so the swap SDK stays out of the
 * dependency graph of anyone who only wants privacy, and importing even its
 * *types* would make it required in order to typecheck against starkzap's own.
 * Its privacy surface is swap-shaped and models `sponsored_private` alone, so it
 * cannot express the no-API-key mode either. A dozen duplicated declarations is
 * the cheaper side of that trade — do not "fix" it by adding the import.
 *
 * Point `url` at a proxy that holds the API key, never at the paymaster with the
 * key in the browser. `default` mode needs no key at all.
 */
export class PrivacyPaymaster {
  private readonly url: string;
  private readonly policy: FeeActionPolicy;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly timeoutMs: number;

  /**
   * @param url - Paymaster endpoint, or a proxy in front of it
   * @param options.maxFee - Ceiling on the quoted fee, in base units of the fee
   *   token. See {@link PrivacyPaymasterConfig.maxFee}
   * @param options.allowedFeeRecipients - Recipients to accept. See
   *   {@link PrivacyPaymasterConfig.allowedFeeRecipients}
   * @param options.fetch - Transport override. See
   *   {@link PrivacyPaymasterConfig.fetch}
   * @param options.timeoutMs - Request ceiling. See
   *   {@link PrivacyPaymasterConfig.timeoutMs}
   */
  constructor(
    url: string,
    options?: {
      maxFee?: bigint;
      allowedFeeRecipients?: readonly Address[];
      fetch?: typeof fetch;
      timeoutMs?: number;
    }
  ) {
    assertSafeHttpUrl(url, "Privacy paymaster URL");
    this.url = url;
    this.policy = {
      ...(options?.maxFee !== undefined && { maxFee: options.maxFee }),
      ...(options?.allowedFeeRecipients !== undefined && {
        allowedFeeRecipients: options.allowedFeeRecipients,
      }),
    };
    this.fetchImpl = options?.fetch;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Ask what the transaction will cost, before proving.
   *
   * The returned {@link PrivacyFeeAction} must be appended to the proof's
   * action list as the final withdrawal. The forwarder collects it from the
   * proof, so a proof built without it is rejected with code 165.
   *
   * Pass {@link PrivacyQuoteOptions.invoke} to relay user calls alongside the
   * pool action. The quote then also returns the SNIP-12 `typedData` those calls
   * have to be signed over.
   *
   * @param poolAddress - Privacy pool the transaction targets
   * @param feeMode - How the fee is paid
   * @param options - Priority, and any user calls to relay
   * @returns The fee to include, the gas figures behind it, the parameters to
   *   echo back on execute, and `typedData` when calls were wrapped
   */
  async quote(
    poolAddress: Address,
    feeMode: PrivacyFeeMode,
    options?: PrivacyQuoteOptions
  ): Promise<PrivacyFeeQuote> {
    const invoke = options?.invoke;
    const apply_action = { pool_address: poolAddress };

    const result = await this.send<{
      fee_action?: { recipient: string; token: string; amount: string };
      fee?: unknown;
      typed_data?: unknown;
      parameters?: unknown;
    }>("paymaster_buildTransaction", {
      transaction: invoke
        ? {
            type: "invoke_and_apply_action",
            apply_action,
            invoke: {
              user_address: invoke.userAddress,
              calls: invoke.calls.map(toPaymasterCall),
            },
          }
        : { type: "apply_action", apply_action },
      parameters: this.parameters(feeMode, options?.tip),
    }).catch((error: unknown) => {
      throw invoke ? explainInvokeRejection(error, invoke) : error;
    });

    // Requested but absent means the paymaster did not honour the wrapping, and
    // submitting without a signature would fail after the proof is paid for.
    if (invoke && result.typed_data === undefined) {
      throw new PrivacyPaymasterError(
        -1,
        "[starkzap] The paymaster accepted `invoke_and_apply_action` but returned " +
          "no `typed_data`, so the wrapped calls cannot be authorised."
      );
    }

    const action = result.fee_action;
    if (!action) {
      throw new PrivacyPaymasterError(
        -1,
        "[starkzap] The paymaster returned no fee action for this pool, so " +
          "there is no way to build a proof it will accept."
      );
    }

    const feeAction = parseFeeAction(action, feeMode, this.policy);

    // Checked before the caller can sign it, and after the fee action, because
    // the forwarder it names is what the caller has to be.
    if (invoke && result.typed_data !== undefined) {
      assertSignableTypedData(
        result.typed_data as TypedData,
        invoke,
        feeAction.recipient
      );
    }

    const gas = parseGasQuote(result.fee);
    return {
      feeAction,
      ...(gas && { gas }),
      ...(result.typed_data !== undefined && {
        typedData: result.typed_data as TypedData,
      }),
      // Echoed back verbatim; falls back to a locally built copy if the service
      // omits them, which older deployments do.
      parameters: result.parameters ?? this.parameters(feeMode, options?.tip),
    };
  }

  /**
   * Submit a proven private transaction.
   *
   * No user signature is involved: the relayer sends it and the pool authorises
   * it from the proof alone, which is what keeps the user's account off-chain.
   *
   * The response may carry an optional `tracking_id`, the relayer's own reference
   * for the submission, and it is returned alongside the hash.
   *
   * Nothing can look one up: SNIP-29 defines no method for it, the paymaster
   * answers "method not found", and the deployment documents no query. That is the
   * reason to keep it rather than to drop it — this response is the only place it
   * ever exists, so a caller who does not record it here can never recover it. It
   * is what a relayer operator asks for when a submitted transaction misbehaves,
   * which makes it useful to people rather than to code.
   *
   * @param call - The pool's `apply_actions` call
   * @param proof - Proof data and facts from the proving service
   * @param parameters - The `parameters` from {@link quote}
   * @param invoke - The signed user calls, when the quote wrapped any. Must be
   *   the same account and the same `typedData` the quote returned
   * @returns The transaction hash, and the relayer's tracking id when it gave one
   */
  async execute(
    call: Call,
    proof: { data: string; proofFacts: string[] },
    parameters: unknown,
    invoke?: PrivacySignedInvoke
  ): Promise<PrivacySubmission> {
    const apply_action = {
      apply_actions_call: toPaymasterCall(call),
      proof: proof.data,
      proof_facts: proof.proofFacts,
    };

    const result = await this.send<{
      transaction_hash?: unknown;
      tracking_id?: unknown;
    }>("paymaster_executeTransaction", {
      transaction: invoke
        ? {
            type: "invoke_and_apply_action",
            apply_action,
            invoke: {
              user_address: invoke.userAddress,
              typed_data: invoke.typedData,
              signature: invoke.signature,
            },
          }
        : { type: "apply_action", apply_action },
      parameters,
    });

    const hash = result.transaction_hash;
    if (typeof hash !== "string" || hash.length === 0) {
      throw new PrivacyPaymasterError(
        -1,
        "[starkzap] The privacy paymaster returned no transaction hash. The " +
          "transaction may still have been submitted.",
        result
      );
    }
    const trackingId = result.tracking_id;
    return {
      transactionHash: hash,
      ...(typeof trackingId === "string" &&
        trackingId.length > 0 && { trackingId }),
    };
  }

  /** Execution parameters in the shape the paymaster expects. */
  private parameters(feeMode: PrivacyFeeMode, tip?: PrivacyTip) {
    const mode =
      feeMode.mode === "default"
        ? { mode: "default" as const, gas_token: feeMode.gasToken }
        : feeMode.mode === "sponsored_private"
          ? {
              mode: "sponsored_private" as const,
              pool_fee_token: feeMode.poolFeeToken,
            }
          : { mode: "sponsored" as const };

    return {
      version: "0x1",
      fee_mode: { ...mode, ...(tip && { tip }) },
    };
  }

  private async send<T>(method: string, params: unknown): Promise<T> {
    // Resolved per call rather than captured in the constructor, so replacing
    // the global (as tests do) still takes effect.
    const send = this.fetchImpl ?? globalThis.fetch;
    const response = await send(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      // Last in the object so a wrapper spreading `init` keeps it, and one
      // setting its own `signal` wins.
      signal: AbortSignal.timeout(this.timeoutMs),
    }).catch((error: unknown) => {
      // Matched by name rather than `instanceof`: this rejects with a
      // `DOMException`, which does not extend `Error` in browsers.
      if ((error as { name?: unknown } | null)?.name !== "TimeoutError") {
        throw error;
      }
      throw new PrivacyPaymasterError(
        -1,
        `[starkzap] The privacy paymaster did not answer ${method} within ` +
          `${this.timeoutMs}ms. Raise \`timeoutMs\` if this endpoint needs longer.`
      );
    });

    // Undefined when the body is not JSON at all — typically an error page from
    // a proxy that failed before reaching the paymaster.
    const body: unknown = await response.json().catch(() => undefined);

    // A JSON-RPC error is checked first, and whatever the status: this is the
    // paymaster itself answering, and its code carries more than the HTTP one.
    const error =
      body === undefined ? undefined : (body as { error?: unknown }).error;
    if (isRpcErrorBody(error)) {
      const rpc = error;
      // The paymaster's own words first, and never replaced: it knows why it
      // rejected the request and we do not. Ours is only ever appended.
      const reported = [rpc.message, reasonFrom(rpc.data)]
        .filter(Boolean)
        .join(" — ");
      const remedy = REMEDIES[method]?.[rpc.code];
      throw new PrivacyPaymasterError(
        rpc.code,
        `[starkzap] Privacy paymaster rejected ${method} (code ${rpc.code}): ` +
          `${reported}${remedy ? ` ${remedy}` : ""}`,
        rpc.data
      );
    }

    // Anything the HTTP layer failed, whether or not the body parsed. The status
    // is the whole diagnosis here and used to be discarded: a proxy answering
    // 500 with its own JSON shape reached neither branch above, and the caller
    // dereferenced an undefined result instead.
    if (!response.ok || body === undefined) {
      const what =
        body === undefined
          ? `returned a non-JSON response (HTTP ${response.status})`
          : `rejected the request with HTTP ${response.status}`;
      throw new PrivacyPaymasterError(
        response.status,
        `[starkzap] The privacy paymaster ${what} for ${method}.`,
        body
      );
    }

    const result = (body as { result?: T }).result;
    if (result === undefined) {
      throw new PrivacyPaymasterError(
        response.status,
        `[starkzap] The privacy paymaster returned no result for ${method} ` +
          `(HTTP ${response.status}).`,
        body
      );
    }
    return result;
  }
}
