import { CallData, hash, num, shortString, stark } from "starknet";
import type { Call, Signature, TypedData } from "starknet";
import { fromAddress, type Address } from "@/types";
import { assertSafeHttpUrl } from "@/utils";

/**
 * How the fee for a private transaction is paid.
 *
 * In every mode the relayer submits the transaction. The user's account never
 * appears on-chain, unless the transaction wraps public calls with `invoke`.
 * The fee always comes from the shielded balance.
 *
 * - `default`: the user pays gas and the pool fee in `gasToken`. The
 *   withdrawal is sized at the paymaster's suggested maximum, not its
 *   estimate. Needs no API key.
 * - `sponsored`: the relayer pays the gas. The user pays a flat pool fee in
 *   the token the deployment chooses. Needs an API key.
 * - `sponsored_private`: like `sponsored`, but the user chooses the fee token.
 *   Needs an API key.
 *
 * {@link PrivacyPaymaster.quote} reports the exact amount and token.
 */
export type PrivacyFeeMode =
  | { mode: "default"; gasToken: Address }
  | { mode: "sponsored" }
  | { mode: "sponsored_private"; poolFeeToken: Address };

/** Transaction priority. The paymaster uses `normal` when omitted. */
export type PrivacyTip = "slow" | "normal" | "fast";

/**
 * Where and how to submit private transactions.
 *
 * Omit the whole object to prove with `createPrivacy` and submit through your
 * own infrastructure.
 */
export interface PrivacyPaymasterConfig {
  /**
   * Paymaster endpoint.
   *
   * For `sponsored` and `sponsored_private`, point this at a proxy that holds
   * the API key. `default` mode needs no key and can use the paymaster
   * directly.
   */
  url: string;
  /**
   * How the fee is paid. There is no default.
   *
   * Every mode is private. The choice is about cost. See
   * {@link PrivacyFeeMode}.
   */
  fee: PrivacyFeeMode;
  /** Transaction priority. Omit to let the paymaster choose. */
  tip?: PrivacyTip;
  /**
   * Transport for paymaster requests. Defaults to the global `fetch`.
   *
   * Wrap `fetch` to add auth headers, cookies, retries or tracing:
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
   * Called as `fetch(url, init)`. Must resolve to a `Response`.
   */
  fetch?: typeof fetch;
  /**
   * Give up on a paymaster request after this many milliseconds.
   *
   * Defaults to two minutes. An `execute` uploads the whole proof, so keep it
   * generous. A {@link PrivacyPaymasterConfig.fetch} wrapper that sets its own
   * `signal` overrides this.
   */
  timeoutMs?: number;
  /**
   * Refuse a quote whose fee exceeds this, in base units of the fee token.
   *
   * This is the only limit on what a bad endpoint can withdraw from the
   * shielded balance. There is no default, because no single value fits every
   * deployment.
   *
   * Size it for your mode. In `sponsored` and `sponsored_private` the
   * withdrawal is the flat pool fee, so a ceiling a little above it is safe. In
   * `default` the withdrawal also includes gas at the paymaster's suggested
   * maximum, so leave room for it.
   */
  maxFee: bigint;
  /**
   * Fee recipients to accept. A quote naming any other recipient is refused.
   * An empty list refuses every quote.
   *
   * Nothing on chain says which recipient is legitimate, so this list is the
   * only anchor. Take the address from your paymaster operator. It changes per
   * deployment and per network.
   */
  allowedFeeRecipients: readonly Address[];
}

/**
 * User calls to relay together with the pool action, as
 * `invoke_and_apply_action`.
 *
 * Without this, a call such as the ERC20 `approve` before a deposit is a
 * separate public transaction. With it, the relayer includes the call in the
 * same transaction.
 *
 * The account must support SNIP-9 outside execution.
 * {@link PrivacyPaymaster.quote} reports when it does not.
 */
export interface PrivacyInvoke {
  /** Account the calls belong to, and whose `execute_from_outside` runs them. */
  userAddress: Address;
  /** Calls to relay. Converted to the paymaster's `to`/`selector` shape. */
  calls: Call[];
  /**
   * Chain the signature is bound to, as a literal like `SN_SEPOLIA` or a felt.
   * Typed data for another chain produces a signature that fails here.
   */
  chainId: string;
}

/**
 * The same calls, signed.
 *
 * `quote()` returns SNIP-12 `typedData` for a {@link PrivacyInvoke}. The user
 * signs it. Pass both back on {@link PrivacyPaymaster.execute}. Do not rebuild
 * the typed data. The signature covers those exact bytes.
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
 * The paymaster's gas estimate, next to the fee.
 *
 * Gas is your fee only in `default` mode, where the withdrawal equals
 * `suggestedMaxInGasToken`. In the sponsored modes the relayer pays gas, so
 * these figures are for display only.
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
 * `trackingId` is the relayer's own reference. Not every deployment returns
 * one. Record it now. Nothing can look it up later.
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
   * Gas figures from the same response. `undefined` when the deployment omits
   * them or uses a shape this cannot read. For display only.
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
   * Execution parameters to pass back to {@link PrivacyPaymaster.execute}
   * unchanged. They may carry fields the service added.
   */
  parameters: unknown;
}

/**
 * Advice appended to a rejection, for codes whose fix is on the caller's side.
 *
 * Keyed by method. The same code means different things on build and execute.
 * The paymaster's own message is always reported unchanged.
 *
 * Add a code only after checking what the paymaster really emits.
 */
const REMEDIES: Record<string, Record<number, string>> = {
  paymaster_executeTransaction: {
    // MISSING_FEE_TRANSFER_TO
    165: "Append the `feeAction` from `quote()` as a withdrawal before proving.",
    // POOL_FEE_TOO_LOW
    167: "The pool fee changed after this proof was built. Quote and prove again.",
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
 * The human-readable reason from a JSON-RPC error's `data`.
 *
 * The paymaster's `message` is only the error name. The real reason is in
 * `data`, as a string or as `{ execution_error: string }`.
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
 * `message` is the paymaster's own, with the reason from `data` appended.
 * `code` and `data` are passed through unchanged.
 *
 * Branch on method and code together. The same code has different meanings
 * on `paymaster_buildTransaction` and `paymaster_executeTransaction`.
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
 * Convert a call to the paymaster's shape, which uses a selector instead of an
 * entrypoint.
 *
 * Calldata is compiled and hex-encoded. `CallData` emits decimal felts, and
 * the paymaster rejects a felt without `0x`.
 */
function toPaymasterCall(call: Call) {
  return {
    // Addresses arrive 0x-prefixed from `fromAddress`. Keep their padding.
    to: call.contractAddress,
    selector: hash.getSelectorFromName(call.entrypoint),
    calldata: CallData.compile(call.calldata ?? []).map((felt) =>
      num.toHex(felt)
    ),
  };
}

/**
 * Explain the one failure `invoke_and_apply_action` has that `apply_action`
 * does not.
 *
 * An account without SNIP-9 support is refused at build time with code `156`
 * and the reason `invalid version`. That reads like a client bug, so name the
 * real cause.
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
 * `num.isBigNumberish` is stricter than `BigInt`, which turns `""` into zero.
 * The catch covers `"0x"`, which passes the guard and then fails.
 */
export function asFelt(value: unknown): bigint | undefined {
  if (!num.isBigNumberish(value)) return undefined;
  try {
    return num.toBigInt(value);
  } catch {
    return undefined;
  }
}

/** Read a value that arrives as a short string but may be a felt. */
function asShortStringFelt(value: unknown): bigint | undefined {
  const felt = asFelt(value);
  if (felt !== undefined) return felt;
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return BigInt(shortString.encodeShortString(value));
  } catch {
    return undefined;
  }
}

/** SNIP-12 domain name every SNIP-9 outside execution is signed under. */
const SNIP9_DOMAIN_NAME = "Account.execute_from_outside";

/**
 * The version and SNIP-12 revision pairs SNIP-9 defines. Version 1 uses
 * revision 0 (Pedersen). Version 2 uses revision 1 (Poseidon).
 */
const SNIP9_DOMAINS: ReadonlyArray<{ version: bigint; revision: bigint }> = [
  { version: 1n, revision: 0n },
  { version: 2n, revision: 1n },
];

/** Compare two felts by value, so padding and radix do not matter. */
function sameFelt(a: unknown, b: unknown): boolean {
  const left = asFelt(a);
  return left !== undefined && left === asFelt(b);
}

/**
 * Check what the paymaster asks the user to sign against what was requested.
 *
 * A bad endpoint could swap the calls, change the caller or widen the validity
 * window. Refuse before anything is signed.
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
  const wanted = asShortStringFelt(invoke.chainId);
  if (wanted === undefined || asShortStringFelt(domain.chainId) !== wanted) {
    reject(
      `it is bound to chain ${String(domain.chainId)}, not ${invoke.chainId}`
    );
  }

  // The domain decides which hash the account computes. A wrong one fails on
  // chain, after the proof is paid for.
  if (asShortStringFelt(domain.name) !== asShortStringFelt(SNIP9_DOMAIN_NAME)) {
    reject(
      `its domain is "${String(domain.name)}", not "${SNIP9_DOMAIN_NAME}"`
    );
  }
  const version = asShortStringFelt(domain.version);
  // SNIP-12 reads a missing revision as 0.
  const revision =
    domain.revision === undefined ? 0n : asShortStringFelt(domain.revision);
  if (
    !SNIP9_DOMAINS.some(
      (known) => known.version === version && known.revision === revision
    )
  ) {
    reject(
      `its domain version ${String(domain.version)} with revision ` +
        `${String(domain.revision ?? 0)} is not a SNIP-9 pairing (1 with 0, ` +
        "or 2 with 1)"
    );
  }

  const message = (typedData.message ?? {}) as Record<string, unknown>;

  // Only the forwarder that collects the fee may relay these calls.
  // `allowedFeeRecipients` anchors that address to configuration.
  if (!sameFelt(message.Caller, forwarder)) {
    reject(
      `the caller is ${String(message.Caller)}, not the forwarder ${forwarder} ` +
        "that collects the fee"
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));

  // No upper bound means the signature never expires. Refuse it.
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
    // Compare against the same conversion the request used.
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

/** Caller-declared bounds on what a quote may claim about its fee. */
interface FeeActionPolicy {
  maxFee: bigint;
  allowedFeeRecipients: readonly Address[];
}

/**
 * Read the paymaster's fee action and validate it.
 *
 * This is a trust boundary. The response decides which address receives how
 * much of the shielded balance, and the proof commits to it.
 */
function parseFeeAction(
  action: { recipient: string; token: string; amount: string },
  feeMode: PrivacyFeeMode,
  policy: FeeActionPolicy
): PrivacyFeeAction {
  let feeAction: PrivacyFeeAction;
  try {
    const amount = asFelt(action.amount);
    if (amount === undefined) {
      throw new Error(
        `the amount ${JSON.stringify(action.amount)} is not a felt`
      );
    }
    feeAction = {
      recipient: fromAddress(action.recipient),
      token: fromAddress(action.token),
      amount,
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

  if (allowedFeeRecipients.length === 0) {
    throw new PrivacyPaymasterError(
      -1,
      "[starkzap] `allowedFeeRecipients` is an empty list, so no quote can be " +
        "accepted. Name the fee recipients you trust.",
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

  // Check the token only in the modes where the caller names it. In
  // `sponsored` the deployment picks it, so `maxFee` is the only bound.
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

  if (feeAction.amount > maxFee) {
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
 * Read the gas block, or return `undefined`.
 *
 * Display only. A missing or malformed block must not fail the transaction.
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
 * Default ceiling on one paymaster request. Sized for
 * `paymaster_executeTransaction`, which uploads the whole proof.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Minimal client for a privacy-capable paymaster.
 *
 * The privacy transaction types (`apply_action`) are not part of SNIP-29, so
 * starknet.js's `PaymasterRpc` cannot express them. This client talks to the
 * paymaster's JSON-RPC endpoint directly.
 *
 * The shapes here mirror `@avnu/avnu-sdk` on purpose, without importing it.
 * That SDK is an optional peer, and even a type import would make it required.
 * Do not "fix" this by adding the import.
 *
 * Point `url` at a proxy that holds the API key. Never put the key in the
 * browser. `default` mode needs no key.
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
   * @param options.allowedFeeRecipients - Recipients to accept. Must not be
   *   empty. See {@link PrivacyPaymasterConfig.allowedFeeRecipients}
   * @param options.fetch - Transport override. See
   *   {@link PrivacyPaymasterConfig.fetch}
   * @param options.timeoutMs - Request ceiling. See
   *   {@link PrivacyPaymasterConfig.timeoutMs}
   * @param options.allowInsecureHttp - Accept a plain `http://` `url` on a
   *   non-loopback host. Loopback is always accepted
   */
  constructor(
    url: string,
    options: {
      maxFee: bigint;
      allowedFeeRecipients: readonly Address[];
      fetch?: typeof fetch;
      timeoutMs?: number;
      allowInsecureHttp?: boolean;
    }
  ) {
    assertSafeHttpUrl(url, "Privacy paymaster URL", {
      allowInsecureHttp: options.allowInsecureHttp,
    });
    this.url = url;
    this.policy = {
      maxFee: options.maxFee,
      allowedFeeRecipients: options.allowedFeeRecipients,
    };
    this.fetchImpl = options.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Ask what the transaction will cost, before proving.
   *
   * Append the returned {@link PrivacyFeeAction} to the proof's action list as
   * the final withdrawal. A proof without it is rejected with code 165.
   *
   * Pass {@link PrivacyQuoteOptions.invoke} to relay user calls with the pool
   * action. The quote then also returns the SNIP-12 `typedData` to sign.
   *
   * @param poolAddress - Privacy pool the transaction targets
   * @param feeMode - How the fee is paid
   * @param options - Priority, and any user calls to relay
   * @returns The fee to include, the gas figures, the parameters to pass back
   *   on execute, and `typedData` when calls were wrapped
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

    // Requested but absent means the paymaster ignored the wrapping.
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

    // Checked after the fee action, because its recipient must be the caller.
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
      // Passed back unchanged. Older deployments omit them, so fall back to a
      // local copy.
      parameters: result.parameters ?? this.parameters(feeMode, options?.tip),
    };
  }

  /**
   * Submit a proven private transaction.
   *
   * No user signature is needed for the pool action. The proof alone
   * authorises it, so the user's account stays off-chain. Wrapped `invoke`
   * calls are the exception. They are signed and they name the account.
   *
   * The response may carry a `tracking_id`. Record it now. Nothing can look it
   * up later, and a relayer operator asks for it when a transaction misbehaves.
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
              signature: stark.signatureToHexArray(invoke.signature),
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
    // Resolved per call, so tests can replace the global `fetch`.
    const send = this.fetchImpl ?? globalThis.fetch;
    const response = await send(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      // Last, so a wrapper that spreads `init` and sets its own `signal` wins.
      signal: AbortSignal.timeout(this.timeoutMs),
    }).catch((error: unknown) => {
      // Matched by name. Browsers reject with a `DOMException`, not an `Error`.
      if ((error as { name?: unknown } | null)?.name !== "TimeoutError") {
        throw error;
      }
      throw new PrivacyPaymasterError(
        -1,
        `[starkzap] The privacy paymaster did not answer ${method} within ` +
          `${this.timeoutMs}ms. Raise \`timeoutMs\` if this endpoint needs longer.`
      );
    });

    // Undefined when the body is not JSON, such as a proxy error page.
    const body: unknown = await response.json().catch(() => undefined);

    // Check for a JSON-RPC error first, whatever the HTTP status. Its code says
    // more.
    const error =
      body === undefined ? undefined : (body as { error?: unknown }).error;
    if (isRpcErrorBody(error)) {
      const rpc = error;
      // The paymaster's own words first. Ours are only appended.
      const reported = [rpc.message, reasonFrom(rpc.data)]
        .filter(Boolean)
        .join(": ");
      const remedy = REMEDIES[method]?.[rpc.code];
      throw new PrivacyPaymasterError(
        rpc.code,
        `[starkzap] Privacy paymaster rejected ${method} (code ${rpc.code}): ` +
          `${reported}${remedy ? ` ${remedy}` : ""}`,
        rpc.data
      );
    }

    // An HTTP failure, with or without a JSON body. The status is the diagnosis.
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
