import {
  Amount,
  fromAddress,
  type Address,
  type ExecuteOptions,
  type Token,
} from "@/types";
import type { Tx } from "@/tx";
import type { WalletInterface } from "@/wallet/interface";
import { PaycrestApi } from "@/paycrest/api";
import { paycrestNetworkFor } from "@/paycrest/presets";
import type {
  OfframpInput,
  OfframpResult,
  OnrampInput,
  OnrampResult,
  PaycrestCurrency,
  PaycrestInstitution,
  PaycrestNetwork,
  PaycrestOptions,
  PaycrestOrder,
  PaycrestOrderList,
  PaycrestOrderStatus,
  PaycrestProviderAccount,
  PaycrestRate,
  PaycrestSenderFeeOverride,
  PaycrestToken,
  PaycrestWaitForOrderOptions,
} from "@/paycrest/types";

/**
 * Thrown by `Paycrest.waitForOrder` when an order reaches a terminal
 * failure state (`refunded`, `expired`, or any state listed in
 * `options.errorStates`). The `order` field carries the final
 * server-side state for inspection.
 */
export class PaycrestOrderError extends Error {
  readonly order: PaycrestOrder;
  constructor(message: string, order: PaycrestOrder) {
    super(message);
    this.name = "PaycrestOrderError";
    this.order = order;
  }
}

/**
 * Thrown when an off-ramp's on-chain transfer fails **after** the Sender
 * API has already created the order. Carries the created order's `id`
 * and `receiveAddress` so callers can resume the transfer (e.g. retry
 * sending tokens to `receiveAddress`) instead of creating a duplicate
 * order.
 *
 * The original execute error is exposed on `cause`.
 */
export class PaycrestOfframpExecuteError extends Error {
  readonly order: PaycrestOrder;
  readonly orderId: string;
  readonly receiveAddress: string;
  readonly cause: unknown;
  constructor(
    message: string,
    args: {
      order: PaycrestOrder;
      receiveAddress: string;
      cause: unknown;
    }
  ) {
    super(message);
    this.name = "PaycrestOfframpExecuteError";
    this.order = args.order;
    this.orderId = args.order.id;
    this.receiveAddress = args.receiveAddress;
    this.cause = args.cause;
  }
}

const DEFAULT_SUCCESS_STATES: readonly PaycrestOrderStatus[] = [
  "validated",
  "settled",
];
const DEFAULT_ERROR_STATES: readonly PaycrestOrderStatus[] = [
  "refunded",
  "expired",
];
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60_000;

/**
 * Fiat on/off-ramp module backed by the Paycrest Sender API.
 *
 * - **Off-ramp**: creates the order via `POST /v2/sender/orders`, then
 *   sends a single ERC20 transfer from the wallet to the order's
 *   assigned `receiveAddress`.
 * - **On-ramp**: creates the order and returns the bank account the user
 *   must pay fiat into; no on-chain transaction from the wallet.
 *
 * Webhook signatures can be verified statically via
 * `Paycrest.verifyWebhookSignature(body, signature, secret)`.
 *
 * @example
 * ```ts
 * const paycrest = new Paycrest({ apiKey: process.env.PAYCREST_API_KEY });
 *
 * const off = await paycrest.offramp(wallet, {
 *   from: { token: USDC, amount: Amount.parse("100", USDC) },
 *   to: { currency: "NGN", recipient: { institution, accountIdentifier, accountName } },
 * });
 * await off.tx.wait();
 * const order = await off.wait(); // fiat settlement
 *
 * const on = await paycrest.onramp({
 *   from: { currency: "NGN", amount: 50000, refundAccount },
 *   to: { token: USDC, recipient: wallet.address },
 * });
 * console.log(on.providerAccount);
 * ```
 */
export class Paycrest {
  private readonly api: PaycrestApi;

  constructor(options: PaycrestOptions = {}) {
    const apiOpts: ConstructorParameters<typeof PaycrestApi>[0] = {};
    if (options.apiBaseUrl !== undefined)
      apiOpts.apiBaseUrl = options.apiBaseUrl;
    if (options.apiKey !== undefined) apiOpts.apiKey = options.apiKey;
    if (options.fetch !== undefined) apiOpts.fetch = options.fetch;
    if (options.requestTimeoutMs !== undefined)
      apiOpts.requestTimeoutMs = options.requestTimeoutMs;
    this.api = new PaycrestApi(apiOpts);
  }

  // ##################################################################
  //                     READ-ONLY API HELPERS
  // ##################################################################

  /** List all fiat currencies available on Paycrest. Public endpoint. */
  async listCurrencies(): Promise<PaycrestCurrency[]> {
    return this.api.getCurrencies();
  }

  /** List all banks / mobile-money operators for a given currency. Public endpoint. */
  async listInstitutions(currencyCode: string): Promise<PaycrestInstitution[]> {
    return this.api.getInstitutions(currencyCode);
  }

  /**
   * List Paycrest-supported stablecoins, optionally filtered to a
   * single network. Public endpoint.
   */
  async listTokens(network?: PaycrestNetwork): Promise<PaycrestToken[]> {
    return this.api.getTokens(network);
  }

  /**
   * Fetch the public quote for an off-ramp (`side: "sell"`) or on-ramp
   * (`side: "buy"`). Call it to display a rate to the user before
   * submitting an order; you can pass that rate back as `input.rate`.
   */
  async getRate(args: {
    network: PaycrestNetwork;
    token: string;
    amount: string | number;
    fiat: string;
    side?: "buy" | "sell";
    providerId?: string;
  }): Promise<PaycrestRate> {
    return this.api.getRate(args);
  }

  /** Fetch order metadata by id. Requires an API key. */
  async getOrder(id: string): Promise<PaycrestOrder> {
    return this.api.getOrder(id);
  }

  /** List orders attached to your sender profile. Requires an API key. */
  async listOrders(
    filter?: Record<string, string | number>
  ): Promise<PaycrestOrderList> {
    return this.api.listOrders(filter);
  }

  /**
   * Poll `GET /v2/sender/orders/{id}` until the order reaches a
   * terminal status. Resolves with the final order on success
   * (`validated` or `settled` by default) and throws
   * `PaycrestOrderError` on failure (`refunded` or `expired`).
   *
   * For production servers, prefer webhooks
   * (`Paycrest.verifyWebhookSignature`) — polling is most useful for
   * scripts, jobs, and end-to-end tests where you don't want to stand
   * up an HTTP endpoint just to await settlement.
   *
   * Defaults: 5s poll interval, 10 min timeout. Pass `signal` to abort.
   *
   * @example
   * ```ts
   * const off = await paycrest.offramp(wallet, { ... });
   *
   * try {
   *   const order = await paycrest.waitForOrder(off.orderId);
   *   // order.status is "validated" or "settled"
   *   console.log("done:", order.status);
   * } catch (err) {
   *   if (err instanceof PaycrestOrderError) {
   *     console.warn("order ended in", err.order.status);
   *   } else {
   *     throw err;
   *   }
   * }
   * ```
   */
  async waitForOrder(
    id: string,
    options: PaycrestWaitForOrderOptions = {}
  ): Promise<PaycrestOrder> {
    const successStates = options.successStates ?? DEFAULT_SUCCESS_STATES;
    const errorStates = options.errorStates ?? DEFAULT_ERROR_STATES;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastStatus: PaycrestOrderStatus | undefined;

    for (;;) {
      if (options.signal?.aborted) {
        throw new Error(
          `Paycrest.waitForOrder(${id}) aborted by signal (last status: ${lastStatus ?? "<none>"})`
        );
      }
      // Forward the caller's signal to the in-flight fetch so an
      // abort cancels the HTTP request immediately rather than
      // waiting for it to complete or time out.
      const order = await this.api.getOrder(
        id,
        options.signal ? { signal: options.signal } : undefined
      );
      lastStatus = order.status;
      if (successStates.includes(order.status)) return order;
      if (errorStates.includes(order.status)) {
        throw new PaycrestOrderError(
          `Paycrest order reached terminal failure state: ${order.status}`,
          order
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Paycrest.waitForOrder(${id}) timed out after ${timeoutMs}ms (last status: ${order.status})`
        );
      }
      await sleep(pollIntervalMs, options.signal);
    }
  }

  // ##################################################################
  //                          OFF-RAMP
  // ##################################################################

  /**
   * Submit an off-ramp order via the Sender API.
   *
   * Creates the order with `POST /v2/sender/orders`, then funds it with a
   * single ERC20 transfer of `amount + senderFee + transactionFee` (the
   * fees the API returns) from `wallet` to the order's `receiveAddress`.
   *
   * If the transfer fails after the order exists, throws
   * `PaycrestOfframpExecuteError` carrying the order so the caller can
   * resume the transfer instead of creating a duplicate order.
   */
  async offramp(
    wallet: WalletInterface,
    input: OfframpInput,
    options?: ExecuteOptions
  ): Promise<OfframpResult> {
    const network = paycrestNetworkFor(wallet.getChainId());
    const body = buildOfframpApiBody({
      input,
      network,
      refundAddress: wallet.address,
    });
    const order = await this.api.createOrder(body);
    // Check both before moving funds: without an id the order can't be
    // tracked, and without a receive address there's nowhere to send.
    if (!order.id) {
      throw new Error(`Paycrest API order response is missing 'id'`);
    }
    const receiveAddress = order.providerAccount?.receiveAddress;
    if (!receiveAddress) {
      throw new Error(
        `Paycrest API order ${order.id} returned no receiveAddress`
      );
    }
    // The app must fund the receive address with the full amount the
    // aggregator expects: order amount plus the senderFee and
    // transactionFee it computed and returned (both in token units).
    // Sending only `amount` underfunds the order.
    const transferAmount = addFees(input.from.amount, input.from.token, [
      order.senderFee,
      order.transactionFee,
    ]);
    const erc20 = wallet.erc20(input.from.token);
    const calls = erc20.populateTransfer([
      { to: fromAddress(receiveAddress), amount: transferAmount },
    ]);
    let tx: Tx;
    try {
      tx = await wallet.execute(calls, options);
    } catch (cause) {
      // The order has been persisted server-side. Surfacing it lets
      // the caller retry the transfer (or call paycrest.getOrder(id))
      // without recreating the order. Recreating would charge fees
      // twice and produce two pending orders against the same intent.
      throw new PaycrestOfframpExecuteError(
        `Paycrest off-ramp transfer failed after order ${order.id} was created. Resume by sending ${transferAmount.toUnit()} ${input.from.token.symbol} to receiveAddress.`,
        { order, receiveAddress, cause }
      );
    }

    return this.attachWait({
      orderId: order.id,
      tx,
      calls,
      receiveAddress,
      ...pickDefined({
        providerAccount: order.providerAccount,
        rate: input.rate,
      }),
    });
  }

  /**
   * Attach a `wait()` method to an `OfframpResult`; it delegates to
   * `waitForOrder(result.orderId)`.
   *
   * `wait()` is memoized **only on success**: a second call reuses the
   * in-flight (or settled) polling promise from the first call instead of
   * starting a second loop against the same order. If the wait rejects
   * (timeout, transient network failure, terminal error state), the cached
   * promise is cleared so a later `wait()` retries cleanly rather than
   * replaying the same failure forever. The tradeoff is that options
   * passed to a later `wait(opts)` are ignored once a call is in flight.
   */
  private attachWait(partial: Omit<OfframpResult, "wait">): OfframpResult {
    let pending: Promise<PaycrestOrder> | undefined;
    const wait = (waitOptions?: PaycrestWaitForOrderOptions) => {
      if (!pending) {
        pending = this.waitForOrder(partial.orderId, waitOptions).catch(
          (err: unknown) => {
            // Drop the failed promise so the next wait() starts a fresh
            // poll instead of returning this same rejection forever.
            pending = undefined;
            throw err;
          }
        );
      }
      return pending;
    };
    return { ...partial, wait };
  }

  // ##################################################################
  //                          ON-RAMP
  // ##################################################################

  /**
   * Submit an on-ramp order via the Sender API. Returns the bank
   * details the user must transfer fiat into. No on-chain transaction
   * is created — the app is responsible for displaying the response
   * `providerAccount` to the user and waiting for a webhook (or
   * polling `getOrder(id)`) before treating the order as settled.
   */
  async onramp(input: OnrampInput): Promise<OnrampResult> {
    const network = inferStarknetNetwork(input.to.recipient);
    const body = buildOnrampApiBody({ input, network });
    const order = await this.api.createOrder(body);
    if (!order.providerAccount) {
      throw new Error(
        `Paycrest onramp order ${order.id ?? "<unknown>"} returned no providerAccount`
      );
    }
    const providerAccount = order.providerAccount as PaycrestProviderAccount;
    // The Sender API surfaces `validUntil` either at the top level of
    // the order or nested under `providerAccount`. Fall back to the
    // nested location so the SDK never drops a real expiry.
    const validUntil = order.validUntil ?? providerAccount.validUntil;
    return {
      orderId: order.id,
      status: order.status,
      providerAccount,
      ...pickDefined({ validUntil, reference: input.reference }),
    };
  }

  // ##################################################################
  //                          WEBHOOKS
  // ##################################################################

  /**
   * Verify an `X-Paycrest-Signature` header against a raw request body
   * using HMAC-SHA256 timing-safe comparison.
   *
   * Run this before trusting webhook payloads. Pass the **raw** request
   * body string (not parsed JSON) — any whitespace difference will fail
   * verification.
   *
   * Throws if `apiSecret` is missing/empty — that's a configuration
   * (programmer) error and must not be confused with a failed
   * verification. A missing or non-matching `signature` returns `false`
   * (a legitimate request-level rejection). The signature is compared
   * case-insensitively so proxies that upcase the hex header still pass.
   */
  static async verifyWebhookSignature(
    rawBody: string,
    signature: string,
    apiSecret: string
  ): Promise<boolean> {
    if (!apiSecret || apiSecret.trim() === "") {
      throw new Error(
        "Paycrest.verifyWebhookSignature requires apiSecret — pass your Paycrest webhook secret (configuration error, not a verification failure)."
      );
    }
    if (!signature) return false;
    const expected = signature.trim().toLowerCase();
    const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto
      ?.subtle;
    if (subtle) {
      const enc = new TextEncoder();
      const key = await subtle.importKey(
        "raw",
        enc.encode(apiSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sigBuf = await subtle.sign("HMAC", key, enc.encode(rawBody));
      const computed = bytesToHex(new Uint8Array(sigBuf));
      return timingSafeEqualHex(computed, expected);
    }
    const nodeCrypto =
      (await import("node:crypto")) as typeof import("node:crypto");
    const computed = nodeCrypto
      .createHmac("sha256", apiSecret)
      .update(rawBody, "utf8")
      .digest("hex");
    return timingSafeEqualHex(computed, expected);
  }
}

// ====================================================================
//                            HELPERS
// ====================================================================

/**
 * Return a shallow copy of `obj` keeping only keys whose value is not
 * `undefined`. Lets call sites spread optional fields into object
 * literals (`{ ...pickDefined({ a, b }) }`) instead of a run of
 * `if (x !== undefined) obj.x = x` statements, while staying compatible
 * with `exactOptionalPropertyTypes` (omits keys rather than setting
 * them to `undefined`).
 */
function pickDefined<T extends object>(
  obj: T
): {
  [K in keyof T]?: Exclude<T[K], undefined>;
} {
  const out: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined) out[key] = value;
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/**
 * Map a per-order sender-fee override to the Sender API body fields.
 * `{ amount }` becomes `senderFee` (token units); `{ percent }` becomes
 * `senderFeePercent`. The two are mutually exclusive server-side, which
 * the union type already enforces at the call site.
 */
function senderFeeOverrideToBody(
  override: PaycrestSenderFeeOverride | undefined
): Record<string, string> {
  if (!override) return {};
  // Check the value, not the key: callers without exactOptionalPropertyTypes
  // can pass `{ percent, amount: undefined }`, where `"amount" in` is true.
  if (override.amount !== undefined) {
    return { senderFee: override.amount.toUnit() };
  }
  return { senderFeePercent: String(override.percent) };
}

/**
 * Add decimal-string fees (token units, e.g. `"0.5"`) to a base Amount.
 * Missing / empty / zero fees are skipped. Used by the off-ramp
 * to fund the receive address with `amount + senderFee + transactionFee`
 * as the Sender API requires.
 */
function addFees(
  base: Amount,
  token: Token,
  fees: Array<string | undefined>
): Amount {
  let total = base;
  for (const fee of fees) {
    if (!fee) continue;
    const parsed = Amount.parse(fee, token);
    if (parsed.toBase() > 0n) total = total.add(parsed);
  }
  return total;
}

function buildOfframpApiBody(args: {
  input: OfframpInput;
  network: PaycrestNetwork;
  refundAddress: Address;
}): Record<string, unknown> {
  const { input, network, refundAddress } = args;
  const recipient = {
    institution: input.to.recipient.institution,
    accountIdentifier: input.to.recipient.accountIdentifier,
    accountName: input.to.recipient.accountName,
    ...pickDefined({ memo: input.to.recipient.memo }),
  };

  return {
    amount: input.from.amount.toUnit(),
    source: {
      type: "crypto",
      currency: input.from.token.symbol,
      network,
      refundAddress,
    },
    destination: {
      type: "fiat",
      currency: input.to.currency,
      recipient,
    },
    ...pickDefined({ reference: input.reference, rate: input.rate }),
    ...senderFeeOverrideToBody(input.senderFeeOverride),
  };
}

function buildOnrampApiBody(args: {
  input: OnrampInput;
  network: PaycrestNetwork;
}): Record<string, unknown> {
  const { input, network } = args;
  return {
    amount: String(input.from.amount),
    amountIn: "fiat",
    source: {
      type: "fiat",
      currency: input.from.currency,
      refundAccount: {
        institution: input.from.refundAccount.institution,
        accountIdentifier: input.from.refundAccount.accountIdentifier,
        accountName: input.from.refundAccount.accountName,
      },
    },
    destination: {
      type: "crypto",
      currency: input.to.token.symbol,
      recipient: {
        address: input.to.recipient,
        network,
      },
    },
    ...pickDefined({ reference: input.reference }),
    ...senderFeeOverrideToBody(input.senderFeeOverride),
  };
}

/**
 * On-ramp doesn't carry a `chainId` directly. Since this SDK is
 * Starknet-only, we always return `"starknet"`. We deliberately do
 * **not** length-check the recipient: a Starknet felt252 address can
 * legitimately fit in 160 bits (and would print as 40 hex digits),
 * so any heuristic guard would block valid recipients.
 */
function inferStarknetNetwork(_recipient: Address): PaycrestNetwork {
  return "starknet";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Paycrest.waitForOrder aborted by signal"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error("Paycrest.waitForOrder aborted by signal"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
