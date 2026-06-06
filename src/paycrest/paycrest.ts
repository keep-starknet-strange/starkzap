import { type Call } from "starknet";
import {
  Amount,
  ChainId,
  fromAddress,
  type Address,
  type ExecuteOptions,
  type Token,
} from "@/types";
import type { Tx } from "@/tx";
import type { WalletInterface } from "@/wallet/interface";
import { PaycrestApi, PaycrestApiError } from "@/paycrest/api";
import { encryptRecipient as defaultEncryptRecipient } from "@/paycrest/encryption";
import { extractOrderIdFromReceipt, PaycrestGateway } from "@/paycrest/gateway";
import {
  paycrestChainIdFor,
  paycrestGatewayFor,
  paycrestNetworkFor,
} from "@/paycrest/presets";
import type {
  OfframpInput,
  OfframpResult,
  OnrampInput,
  OnrampResult,
  PaycrestCurrency,
  PaycrestEncryptor,
  PaycrestInstitution,
  PaycrestNetwork,
  PaycrestOfframpStatus,
  PaycrestOptions,
  PaycrestOrder,
  PaycrestOrderList,
  PaycrestOrderStatus,
  PaycrestProviderAccount,
  PaycrestProviderOrderStatus,
  PaycrestRate,
  PaycrestRateSide,
  PaycrestRecipient,
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
 * Thrown when an api-path off-ramp's on-chain transfer call fails
 * **after** the Sender API has already created the order. Carries the
 * created order's `id` and `receiveAddress` so callers can resume the
 * transfer (e.g. retry sending tokens to `receiveAddress`) instead of
 * creating a duplicate order.
 *
 * The original execute error is exposed on `cause`.
 */
export class PaycrestOfframpExecuteError extends Error {
  readonly order: PaycrestOrder;
  readonly orderId: string | undefined;
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
 * Paycrest's rate convention: `/v2/rates` returns the fiat rate as a
 * decimal string (e.g. `"1500.50"`). The on-chain Gateway accepts the
 * rate as an integer scaled by 100 — i.e. 2 decimal places. This
 * matches the EVM Paycrest deployments (e.g. an on-chain rate of
 * `156000` represents `1560.00`; `136192` represents `1361.92`).
 */
const RATE_DECIMALS = 2n;

/**
 * Like `Omit`, but distributes over union members so each branch keeps
 * its own keys. Plain `Omit<A | B, K>` collapses to the members' shared
 * keys, which would drop the path-specific fields of `OfframpResult`.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * Fiat on/off-ramp module backed by Paycrest. Two paths share the same
 * TypeScript surface:
 *
 * - `path: "gateway"` (off-ramp default) — encrypts recipient details
 *   with the aggregator's RSA public key and emits an approve +
 *   `create_order` Call pair on the Cairo Gateway. Fully on-chain.
 * - `path: "api"` — POSTs to the Sender API and returns a single ERC20
 *   transfer Call to the assigned receive address.
 *
 * On-ramp uses the Sender API only — Gateway on-ramp isn't supported by
 * Paycrest. Webhook signatures can be verified statically via
 * `Paycrest.verifyWebhookSignature(body, signature, secret)`.
 *
 * @example
 * ```ts
 * const paycrest = new Paycrest({ apiKey: process.env.PAYCREST_API_KEY });
 *
 * // Off-ramp via Gateway (default path)
 * const off = await paycrest.offramp(wallet, {
 *   from: { token: USDC, amount: Amount.parse("100", USDC) },
 *   to: { currency: "NGN", recipient: { institution, accountIdentifier, accountName } },
 * });
 * await off.tx.wait();
 *
 * // On-ramp (Sender API only)
 * const on = await paycrest.onramp({
 *   from: { currency: "NGN", amount: 50000, refundAccount },
 *   to: { token: USDC, recipient: wallet.address },
 * });
 * console.log(on.providerAccount);
 * ```
 */
export class Paycrest {
  private readonly api: PaycrestApi;
  private readonly apiKey: string | undefined;
  private readonly gatewayAddressOverride: Address | undefined;
  private readonly encryptor: PaycrestEncryptor;
  private cachedPublicKey: string | null = null;

  constructor(options: PaycrestOptions = {}) {
    this.apiKey = options.apiKey;
    this.gatewayAddressOverride = options.gatewayAddress;
    this.encryptor = options.encryptRecipient ?? defaultEncryptRecipient;
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
   * Fetch the public quote for an off-ramp / on-ramp. The gateway path
   * fetches this internally; you only need to call it explicitly if you
   * want to display a rate to the user before submitting an order.
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
   * const orderId = await off.orderId;
   * if (!orderId) throw new Error("on-chain create_order reverted");
   *
   * try {
   *   const order = await paycrest.waitForOrder(orderId);
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
    return this.pollUntilTerminal(
      `waitForOrder(${id})`,
      (signal?: AbortSignal) =>
        this.api.getOrder(id, signal ? { signal } : undefined),
      options
    );
  }

  /**
   * Poll `GET /v2/orders/{chain_id}/{gateway_id}` until the order
   * reaches a terminal status. Used for gateway-path off-ramps where
   * only the on-chain felt252 gateway_id is known — the
   * `/v2/sender/orders/{id}` endpoint doesn't index gateway_id.
   *
   * `chainId` defaults to `STARKNET_MAINNET_CHAIN_ID`; pass an
   * override for forks or future redeployments. Same terminal-state
   * semantics as `waitForOrder`: resolves on `validated` / `settled`,
   * throws `PaycrestOrderError` on `refunded` / `expired`.
   */
  async waitForGatewayOrder(
    gatewayId: string,
    options: PaycrestWaitForOrderOptions & {
      chainId?: bigint | number | string;
    } = {}
  ): Promise<PaycrestProviderOrderStatus> {
    const chainId = options.chainId ?? paycrestChainIdFor(ChainId.MAINNET);
    return this.pollUntilTerminal<PaycrestProviderOrderStatus>(
      `waitForGatewayOrder(${gatewayId})`,
      (signal?: AbortSignal) =>
        this.api.getProviderOrderStatus(
          chainId,
          gatewayId,
          signal ? { signal } : undefined
        ),
      options,
      // 404 is transient here while the aggregator's indexer catches up
      // to a freshly-emitted on-chain `OrderCreated` event. The api-path
      // poller below intentionally does NOT enable this — a 404 there
      // means a bad UUID and should fail immediately.
      { retryOnNotFound: true }
    );
  }

  /**
   * Generic terminal-state poller. Both `waitForOrder` and
   * `waitForGatewayOrder` share this loop — the `fetchStatus`
   * callback is the only path-specific bit.
   */
  private async pollUntilTerminal<T extends { status: PaycrestOrderStatus }>(
    label: string,
    fetchStatus: (signal?: AbortSignal) => Promise<T>,
    options: PaycrestWaitForOrderOptions,
    pollerOptions: { retryOnNotFound?: boolean } = {}
  ): Promise<T> {
    const successStates = options.successStates ?? DEFAULT_SUCCESS_STATES;
    const errorStates = options.errorStates ?? DEFAULT_ERROR_STATES;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let lastStatus: PaycrestOrderStatus | undefined;

    for (;;) {
      if (options.signal?.aborted) {
        throw new Error(
          `Paycrest.${label} aborted by signal (last status: ${lastStatus ?? "<none>"})`
        );
      }
      // Forward the caller's signal to the in-flight fetch so an
      // abort cancels the HTTP request immediately rather than
      // waiting for it to complete or time out.
      let result: T;
      try {
        result = await fetchStatus(options.signal);
      } catch (err) {
        // Retry-on-404 is only enabled for callers that expect indexer
        // lag (currently `waitForGatewayOrder`). For everything else a
        // 404 is a definitive "no such order" — fail fast.
        if (
          pollerOptions.retryOnNotFound &&
          err instanceof PaycrestApiError &&
          err.status === 404
        ) {
          if (Date.now() >= deadline) {
            throw new Error(
              `Paycrest.${label} timed out after ${timeoutMs}ms (order never indexed by Paycrest)`
            );
          }
          await sleep(pollIntervalMs, options.signal);
          continue;
        }
        throw err;
      }
      lastStatus = result.status;
      if (successStates.includes(result.status)) return result;
      if (errorStates.includes(result.status)) {
        // Wrap status-only responses into the PaycrestOrder shape so
        // PaycrestOrderError.order is uniform across both endpoints.
        const orderLike = (result as unknown as { id?: string }).id
          ? (result as unknown as PaycrestOrder)
          : ({
              ...result,
              id: (result as unknown as { orderId?: string }).orderId ?? "",
            } as unknown as PaycrestOrder);
        throw new PaycrestOrderError(
          `Paycrest order reached terminal failure state: ${result.status}`,
          orderLike
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Paycrest.${label} timed out after ${timeoutMs}ms (last status: ${result.status})`
        );
      }
      await sleep(pollIntervalMs, options.signal);
    }
  }

  /**
   * Path-aware off-ramp settlement wait. Called by
   * `OfframpResult.wait()` — dispatches to the correct endpoint based
   * on `result.path` and returns a unified
   * `{ status, txHash, orderId, raw }` shape.
   *
   * @internal Used by the result builder; users call `result.wait()`.
   */
  async waitForOfframp(
    result: Pick<OfframpResult, "path" | "orderId">,
    options: PaycrestWaitForOrderOptions & {
      chainId?: bigint | number | string;
    } = {}
  ): Promise<PaycrestOfframpStatus> {
    const id = await result.orderId;
    if (!id) {
      throw new Error(
        result.path === "gateway"
          ? `Paycrest gateway off-ramp has no on-chain order id (create_order likely reverted — check tx.wait()).`
          : `Paycrest api off-ramp has no order id (server response was missing 'id').`
      );
    }
    if (result.path === "api") {
      const order = await this.waitForOrder(id, options);
      return {
        path: "api",
        orderId: id,
        status: order.status,
        raw: order,
        ...pickDefined({ txHash: order.txHash }),
      };
    }
    const provider = await this.waitForGatewayOrder(id, options);
    return {
      path: "gateway",
      orderId: id,
      status: provider.status,
      raw: provider,
      ...pickDefined({ txHash: provider.txHash }),
    };
  }

  // ##################################################################
  //                          OFF-RAMP
  // ##################################################################

  /**
   * Build the on-chain Calls for a gateway-path off-ramp without
   * executing. Returns `{ calls, rate }` so callers can compose the
   * approve + create_order pair atomically with other operations via
   * `wallet.tx().add(...)`.
   *
   * Throws if `path` is `"api"` — the API path requires an HTTP order
   * creation step that doesn't fit the synchronous builder shape.
   */
  async populateOfframp(
    wallet: WalletInterface,
    input: OfframpInput
  ): Promise<{ calls: Call[]; rate: string }> {
    const path = input.path ?? "gateway";
    if (path !== "gateway") {
      throw new Error(
        `Paycrest.populateOfframp only supports the gateway path. For api-path offramp, call Paycrest.offramp directly.`
      );
    }
    return this.buildGatewayOfframpCalls(wallet, input);
  }

  /**
   * Submit an off-ramp order. Defaults to the gateway path; pass
   * `path: "api"` to route via the Sender API instead.
   */
  async offramp(
    wallet: WalletInterface,
    input: OfframpInput,
    options?: ExecuteOptions
  ): Promise<OfframpResult> {
    const path = input.path ?? "gateway";
    if (path === "gateway")
      return this.offrampViaGateway(wallet, input, options);
    return this.offrampViaApi(wallet, input, options);
  }

  private async offrampViaGateway(
    wallet: WalletInterface,
    input: OfframpInput,
    options?: ExecuteOptions
  ): Promise<OfframpResult> {
    const { calls, rate } = await this.buildGatewayOfframpCalls(wallet, input);
    const tx = await wallet.execute(calls, options);
    const gateway = this.resolveGatewayAddress(wallet.getChainId());
    return this.attachWait(
      {
        path: "gateway",
        orderId: this.resolveGatewayOrderId(tx, gateway),
        tx,
        calls,
        rate,
      },
      // Capture the originating chain so result.wait() polls the correct
      // Paycrest index rather than always falling back to the mainnet default.
      { chainId: paycrestChainIdFor(wallet.getChainId()) }
    );
  }

  /**
   * Attach a `wait()` method to a partially-built `OfframpResult`. The
   * method delegates to `waitForOfframp`, dispatching to the correct
   * endpoint based on `result.path`.
   *
   * `defaultWaitOptions` are merged with whatever the caller passes to
   * `result.wait(opts)` — caller options take precedence. Used by the
   * gateway path to propagate the originating `chainId` so
   * `waitForGatewayOrder` polls the correct Paycrest index rather than
   * always falling back to the mainnet default.
   *
   * `wait()` is memoized: a second call reuses the in-flight (or
   * settled) polling promise from the first call instead of starting a
   * second loop against the same order. The tradeoff is that options
   * passed to a later `wait(opts)` are ignored once the first call has
   * started.
   */
  private attachWait(
    partial: DistributiveOmit<OfframpResult, "wait">,
    defaultWaitOptions?: PaycrestWaitForOrderOptions & {
      chainId?: bigint | number | string;
    }
  ): OfframpResult {
    const result = partial as OfframpResult;
    let pending: Promise<PaycrestOfframpStatus> | undefined;
    result.wait = (waitOptions?: PaycrestWaitForOrderOptions) =>
      (pending ??= this.waitForOfframp(result, {
        ...(defaultWaitOptions ?? {}),
        ...(waitOptions ?? {}),
      }));
    return result;
  }

  /**
   * Wait for the L2 receipt and parse the `OrderCreated` event for the
   * gateway off-ramp. Returns `null` if the receipt has no matching
   * event (typically a revert — `tx.wait()` will surface the reason).
   */
  private async resolveGatewayOrderId(
    tx: Tx,
    gateway: Address
  ): Promise<string | null> {
    try {
      await tx.wait();
    } catch {
      return null;
    }
    const receipt = (await tx.receipt()) as {
      events?: ReadonlyArray<{
        from_address?: string;
        keys?: string[];
        data?: string[];
      }>;
    };
    return extractOrderIdFromReceipt(receipt, gateway);
  }

  private async offrampViaApi(
    wallet: WalletInterface,
    input: OfframpInput,
    options?: ExecuteOptions
  ): Promise<OfframpResult> {
    // `senderFee` is a gateway-path concept (an on-chain fee + recipient
    // set on `create_order`). The Sender API has no per-request fee
    // recipient — fees are configured on the Paycrest Sender Dashboard
    // and returned in the order — so reject it here rather than silently
    // ignore it.
    if (input.senderFee) {
      throw new Error(
        `Paycrest: senderFee is only supported on the gateway path. On the api path, configure fees on your Paycrest Sender Dashboard; the SDK transfers amount + senderFee + transactionFee returned by the API.`
      );
    }
    const network = paycrestNetworkFor(wallet.getChainId());
    const body = buildOfframpApiBody({
      input,
      network,
      refundAddress: wallet.address,
    });
    const order = await this.api.createOrder(body);
    const receiveAddress = order.providerAccount?.receiveAddress;
    if (!receiveAddress) {
      throw new Error(
        `Paycrest API order ${order.id ?? "<unknown>"} returned no receiveAddress`
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
        `Paycrest api off-ramp execute failed after order ${order.id ?? "<unknown>"} was created. Resume by sending ${transferAmount.toUnit()} ${input.from.token.symbol} to receiveAddress.`,
        { order, receiveAddress, cause }
      );
    }

    return this.attachWait({
      path: "api",
      orderId: Promise.resolve(order.id ?? null),
      tx,
      calls,
      receiveAddress,
      ...(order.providerAccount
        ? { providerAccount: order.providerAccount }
        : {}),
      ...(input.rate ? { rate: input.rate } : {}),
    });
  }

  private async buildGatewayOfframpCalls(
    wallet: WalletInterface,
    input: OfframpInput
  ): Promise<{ calls: Call[]; rate: string }> {
    // `senderFeeOverride` maps to the Sender API `senderFee`/
    // `senderFeePercent` body fields — there's no order-creation HTTP
    // call on the gateway path to carry them. Reject rather than ignore.
    if (input.senderFeeOverride) {
      throw new Error(
        `Paycrest: senderFeeOverride only applies to the api path. On the gateway path, set senderFee: { recipient, amount } for the on-chain fee instead.`
      );
    }
    const chainId = wallet.getChainId();
    const network = paycrestNetworkFor(chainId);
    const gatewayAddress = this.resolveGatewayAddress(chainId);

    // Honor a caller-supplied rate (e.g. one already shown to the user
    // in the UI). Falls back to fetching `/v2/rates` when omitted so
    // the gateway path remains usable without a separate quote step.
    const rateString =
      input.rate ??
      (await this.fetchRate({
        network,
        token: input.from.token.symbol,
        amount: input.from.amount.toUnit(),
        fiat: input.to.currency,
      }));

    const messageHash = await this.encryptRecipientPayload(input.to.recipient);

    const senderFeeAmount = input.senderFee?.amount ?? 0n;
    const senderFeeRecipient =
      input.senderFee?.recipient ?? (fromAddress("0x0") as Address);

    const erc20 = wallet.erc20(input.from.token);
    const approveAmount = input.from.amount.toBase() + senderFeeAmount;
    const approveCall = erc20.populateApprove(
      gatewayAddress,
      approveAmount === input.from.amount.toBase()
        ? input.from.amount
        : Amount.fromRaw(approveAmount, input.from.token)
    );

    const gateway = new PaycrestGateway(gatewayAddress, wallet.getProvider());
    const createOrderCall = gateway.populateCreateOrder({
      token: input.from.token.address,
      amount: input.from.amount.toBase(),
      rate: rateToU128(rateString),
      senderFeeRecipient,
      senderFee: senderFeeAmount,
      refundAddress: wallet.address,
      messageHash,
    });

    return { calls: [approveCall, createOrderCall], rate: rateString };
  }

  private resolveGatewayAddress(chainId: ChainId): Address {
    return this.gatewayAddressOverride ?? paycrestGatewayFor(chainId);
  }

  private async fetchRate(args: {
    network: PaycrestNetwork;
    token: string;
    amount: string;
    fiat: string;
  }): Promise<string> {
    const rate = await this.api.getRate({ ...args, side: "sell" });
    const side: PaycrestRateSide | undefined = rate.sell ?? rate.buy;
    if (!side?.rate) {
      throw new Error(
        `Paycrest /v2/rates returned no rate for ${args.token}/${args.fiat} on ${args.network}`
      );
    }
    return side.rate;
  }

  private async encryptRecipientPayload(
    recipient: PaycrestRecipient
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        `Paycrest gateway off-ramp requires an apiKey — pass it to the Paycrest constructor or via SDKConfig.paycrest.apiKey.`
      );
    }
    const pem = await this.getOrFetchPublicKey();
    const payload: Record<string, unknown> = {
      institution: recipient.institution,
      accountIdentifier: recipient.accountIdentifier,
      accountName: recipient.accountName,
      metadata: { apiKey: this.apiKey },
    };
    if (recipient.memo !== undefined) payload["memo"] = recipient.memo;
    return this.encryptor(pem, JSON.stringify(payload));
  }

  private async getOrFetchPublicKey(): Promise<string> {
    if (this.cachedPublicKey !== null) return this.cachedPublicKey;
    const pem = await this.api.getPublicKey();
    this.cachedPublicKey = pem;
    return pem;
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
  if ("amount" in override) return { senderFee: override.amount.toUnit() };
  return { senderFeePercent: String(override.percent) };
}

/**
 * Add decimal-string fees (token units, e.g. `"0.5"`) to a base Amount.
 * Missing / empty / zero fees are skipped. Used by the api-path off-ramp
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

/**
 * Convert a decimal-string rate from `/v2/rates` (e.g. `"1500.50"`)
 * into the integer the on-chain `create_order` accepts (`150050n`).
 *
 * Exported for tests; not part of the public Paycrest API.
 *
 * @internal
 */
export function rateToU128(decimalString: string): bigint {
  // Convert "1500.50" -> 150050n given RATE_DECIMALS = 2.
  // Reject anything that isn't a non-negative decimal — previously a
  // lenient `replace(/^[^0-9]+/, "")` silently turned "-1.23" into
  // "1.23", which would submit a materially wrong rate on-chain.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimalString.trim());
  if (!match) {
    throw new Error(
      `Paycrest rate "${decimalString}" is not a valid non-negative decimal — trim any prefix (e.g. "$") and reject negatives upstream.`
    );
  }
  const whole = match[1]!;
  const fractional = match[2] ?? "";
  if (fractional.length > Number(RATE_DECIMALS)) {
    // Silently truncating would let the caller submit a different
    // rate than the one they fetched/displayed. Throw so the caller
    // notices and rounds explicitly upstream.
    throw new Error(
      `Paycrest rate "${decimalString}" has more than ${RATE_DECIMALS.toString()} decimal places — round before submitting (the on-chain Gateway accepts u128 scaled to 2 decimals).`
    );
  }
  const padded = (fractional + "0".repeat(Number(RATE_DECIMALS))).slice(
    0,
    Number(RATE_DECIMALS)
  );
  return BigInt(whole + padded);
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
