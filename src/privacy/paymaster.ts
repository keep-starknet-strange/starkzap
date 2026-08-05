import { hash } from "starknet";
import type { Call } from "starknet";
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
 * {@link withPaymaster} nor `wallet.privacy()` can be handed half a
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
 * Read the paymaster's fee action, validating rather than trusting it.
 *
 * This is a trust boundary. The response decides which address receives how much
 * of the caller's shielded balance, and the proof then commits to it — so the
 * addresses go through `fromAddress` like every other address in starkzap, and a
 * malformed amount is named here instead of surfacing as a bare BigInt
 * `SyntaxError` from inside a quote.
 */
function parseFeeAction(
  action: { recipient: string; token: string; amount: string },
  maxFee: bigint | undefined
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
  private readonly maxFee: bigint | undefined;

  /**
   * @param url - Paymaster endpoint, or a proxy in front of it
   * @param options.maxFee - Ceiling on the quoted fee, in base units of the fee
   *   token. See {@link PrivacyPaymasterConfig.maxFee}
   */
  constructor(url: string, options?: { maxFee?: bigint }) {
    assertSafeHttpUrl(url, "Privacy paymaster URL");
    this.url = url;
    this.maxFee = options?.maxFee;
  }

  /**
   * Ask what the transaction will cost, before proving.
   *
   * The returned {@link PrivacyFeeAction} must be appended to the proof's
   * action list as the final withdrawal. The forwarder collects it from the
   * proof, so a proof built without it is rejected with code 165.
   *
   * @param poolAddress - Privacy pool the transaction targets
   * @param feeMode - How the fee is paid
   * @param tip - Optional priority
   * @returns The fee to include, the gas figures behind it, and the parameters
   *   to echo back on execute
   */
  async quote(
    poolAddress: Address,
    feeMode: PrivacyFeeMode,
    tip?: PrivacyTip
  ): Promise<PrivacyFeeQuote> {
    const result = await this.send<{
      fee_action?: { recipient: string; token: string; amount: string };
      fee?: unknown;
      parameters?: unknown;
    }>("paymaster_buildTransaction", {
      transaction: {
        type: "apply_action",
        apply_action: { pool_address: poolAddress },
      },
      parameters: this.parameters(feeMode, tip),
    });

    const action = result.fee_action;
    if (!action) {
      throw new PrivacyPaymasterError(
        -1,
        "[starkzap] The paymaster returned no fee action for this pool, so " +
          "there is no way to build a proof it will accept."
      );
    }

    const gas = parseGasQuote(result.fee);
    return {
      feeAction: parseFeeAction(action, this.maxFee),
      ...(gas && { gas }),
      // Echoed back verbatim; falls back to a locally built copy if the service
      // omits them, which older deployments do.
      parameters: result.parameters ?? this.parameters(feeMode, tip),
    };
  }

  /**
   * Submit a proven private transaction.
   *
   * No user signature is involved: the relayer sends it and the pool authorises
   * it from the proof alone, which is what keeps the user's account off-chain.
   *
   * @param call - The pool's `apply_actions` call
   * @param proof - Proof data and facts from the proving service
   * @param parameters - The `parameters` from {@link quote}
   * @returns The submitted transaction hash
   */
  async execute(
    call: Call,
    proof: { data: string; proofFacts: string[] },
    parameters: unknown
  ): Promise<string> {
    const result = await this.send<{ transaction_hash: string }>(
      "paymaster_executeTransaction",
      {
        transaction: {
          type: "apply_action",
          apply_action: {
            apply_actions_call: {
              to: call.contractAddress,
              selector: hash.getSelectorFromName(call.entrypoint),
              calldata: call.calldata ?? [],
            },
            proof: proof.data,
            proof_facts: proof.proofFacts,
          },
        },
        parameters,
      }
    );
    return result.transaction_hash;
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
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
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
