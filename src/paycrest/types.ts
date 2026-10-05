import type { Address } from "@/types/address";
import type { Amount } from "@/types/amount";
import type { Token } from "@/types/token";
import type { ExecuteOptions } from "@/types/wallet";
import type { Tx } from "@/tx";
import type { Call } from "starknet";

/**
 * Networks recognised by the Paycrest backend. The Sender API uses these
 * literals in `source.network` / `destination.recipient.network` and as
 * the `{network}` path segment in the rates endpoint.
 */
export type PaycrestNetwork =
  | "starknet"
  | "ethereum"
  | "base"
  | "arbitrum-one"
  | "polygon"
  | "bnb-smart-chain"
  | "lisk"
  | "celo"
  | "scroll"
  | "asset-chain";

/**
 * Wire format returned by `GET /v2/tokens`. Contract addresses are returned
 * as raw strings — callers should pass them through `fromAddress()` before
 * using them as Starknet contract addresses.
 */
export interface PaycrestToken {
  symbol: string;
  contractAddress: string;
  decimals: number;
  baseCurrency: string;
  network: PaycrestNetwork;
}

/** Wire format returned by `GET /v2/currencies`. */
export interface PaycrestCurrency {
  code: string;
  name: string;
  shortName: string;
  decimals: number;
  symbol: string;
  marketBuyRate: string;
  marketSellRate: string;
}

/** Wire format returned by `GET /v2/institutions/{currencyCode}`. */
export interface PaycrestInstitution {
  name: string;
  code: string;
  type: "bank" | "mobile_money";
}

/** Wire format returned by `GET /v2/rates/{network}/{token}/{amount}/{fiat}`. */
export interface PaycrestRate {
  buy?: PaycrestRateSide;
  sell?: PaycrestRateSide;
}

export interface PaycrestRateSide {
  rate: string;
  providerIds: string[];
  orderType: string;
  refundTimeoutMinutes: number;
}

/** Bank or mobile-money destination on the off-ramp side. */
export interface PaycrestRecipient {
  /** SWIFT code or Paycrest institution code (suffix `PC`). */
  institution: string;
  /** Bank account number or mobile-money number. */
  accountIdentifier: string;
  /** Account holder's verified name. */
  accountName: string;
  /** Optional payment memo / narration. */
  memo?: string;
}

/** Fiat refund destination for an on-ramp order, used if the order can't be fulfilled. */
export interface PaycrestRefundAccount {
  institution: string;
  accountIdentifier: string;
  accountName: string;
}

/** Sub-status payment_order webhook event names. */
export type PaycrestWebhookEventName =
  | "payment_order.deposited"
  | "payment_order.pending"
  | "payment_order.validated"
  | "payment_order.settling"
  | "payment_order.settled"
  | "payment_order.refunding"
  | "payment_order.refunded"
  | "payment_order.expired";

export type PaycrestOrderStatus =
  | "initiated"
  | "pending"
  | "deposited"
  | "validated"
  | "settling"
  | "settled"
  | "refunding"
  | "refunded"
  | "expired";

/**
 * Account details surfaced by the Sender API after creating an order.
 *
 * For off-ramp orders this carries `receiveAddress` (the on-chain address
 * the app must send tokens to). For on-ramp orders this carries the
 * institution + account number the user must transfer fiat into, plus
 * `amountToTransfer` and `currency`.
 */
export interface PaycrestProviderAccount {
  network?: PaycrestNetwork;
  receiveAddress?: string;
  institution?: string;
  accountIdentifier?: string;
  accountName?: string;
  amountToTransfer?: string;
  currency?: string;
  validUntil?: string;
}

/** Generic order shape returned by the Sender API. */
export interface PaycrestOrder {
  id: string;
  direction?: "onramp" | "offramp";
  status: PaycrestOrderStatus;
  amount?: string;
  /**
   * Sender fee in token units, returned by the Sender API. For an
   * off-ramp the app must transfer `amount + senderFee + transactionFee`
   * to `providerAccount.receiveAddress`.
   */
  senderFee?: string;
  /** Network/transaction fee in token units, returned by the Sender API. */
  transactionFee?: string;
  txHash?: string;
  reference?: string;
  providerAccount?: PaycrestProviderAccount;
  validUntil?: string;
}

/**
 * Paginated result returned by `GET /v2/sender/orders` (`listOrders`).
 * Pagination metadata is typed explicitly rather than via an open index
 * signature so unknown server fields don't silently degrade to `unknown`;
 * fields the aggregator may add beyond these are still present at runtime.
 */
export interface PaycrestOrderList {
  orders: PaycrestOrder[];
  total?: number;
  page?: number;
  pageSize?: number;
}

/** Webhook payload posted to the configured endpoint by the Paycrest backend. */
export interface PaycrestWebhookPayload {
  event: PaycrestWebhookEventName;
  webhookVersion: string;
  data: PaycrestOrder;
}

/**
 * Per-instance options accepted by `new Paycrest(...)`. Most apps will
 * supply `apiKey` only; the rest are escape hatches for testing, custom
 * deployments, or non-standard runtimes.
 */
export interface PaycrestOptions {
  /**
   * Paycrest API key.
   *
   * Optional at construction — public read endpoints
   * (`listCurrencies`, `listInstitutions`, `listTokens`, `getRate`)
   * work without one. Order calls (`getOrder`, `listOrders`,
   * `waitForOrder`, `offramp`, `onramp`) throw a clear runtime error
   * if omitted.
   */
  apiKey?: string;
  /** Override the API base URL. Defaults to `https://api.paycrest.io`. */
  apiBaseUrl?: string;
  /** Inject a `fetch` implementation (testing or custom HTTP runtime). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 15000. */
  requestTimeoutMs?: number;
}

/**
 * Per-order sender-fee override for the Sender API (off-ramp and
 * on-ramp). Overrides the fee configured on your Paycrest Sender
 * Dashboard for this single order.
 *
 * Provide exactly one of `amount` or `percent` — they are mutually
 * exclusive (the API rejects both). The fee **recipient** is always your
 * dashboard-configured fee address and cannot be set per-order.
 */
export type PaycrestSenderFeeOverride =
  | {
      /** Fixed fee in token units. Maps to the API `senderFee` field. */
      amount: Amount;
      /** @internal Discriminator — not a valid field; enforces XOR with `amount`. */
      percent?: never;
    }
  | {
      /**
       * Fee percentage of the order amount (e.g. `0.5` for 0.5%). Maps to
       * the API `senderFeePercent` field; capped server-side by your
       * token's max-fee config.
       */
      percent: number | string;
      /** @internal Discriminator — not a valid field; enforces XOR with `percent`. */
      amount?: never;
    };

/**
 * Input to `Paycrest.offramp(wallet, input)`.
 *
 * The SDK POSTs the order to `/v2/sender/orders`, then sends a single
 * ERC20 transfer of `amount + senderFee + transactionFee` (the fees the
 * API returns) from the wallet to the order's `receiveAddress`.
 */
export interface OfframpInput {
  from: {
    token: Token;
    amount: Amount;
  };
  to: {
    currency: string;
    recipient: PaycrestRecipient;
  };
  /** App-side identifier echoed back on the order and webhook. Optional. */
  reference?: string;
  /**
   * Optional pre-fetched rate (e.g. one already shown to the user),
   * forwarded in the `POST /v2/sender/orders` body. When omitted the
   * Sender API quotes the rate itself.
   */
  rate?: string;
  /**
   * Per-order sender-fee override. Overrides your Sender Dashboard fee
   * config for this order. See {@link PaycrestSenderFeeOverride}.
   */
  senderFeeOverride?: PaycrestSenderFeeOverride;
}

/** Input to `Paycrest.onramp(input)`. */
export interface OnrampInput {
  from: {
    currency: string;
    /** Fiat amount as a stringified or numeric value (Paycrest accepts both). */
    amount: string | number;
    refundAccount: PaycrestRefundAccount;
  };
  to: {
    token: Token;
    recipient: Address;
  };
  reference?: string;
  /**
   * Per-order sender-fee override. Overrides your Sender Dashboard fee
   * config for this order. See {@link PaycrestSenderFeeOverride}.
   */
  senderFeeOverride?: PaycrestSenderFeeOverride;
}

/** Result returned by `Paycrest.offramp(...)`. */
export interface OfframpResult {
  /** Sender API order id (UUID) returned by `POST /v2/sender/orders`. */
  orderId: string;
  /** The ERC20 transfer funding the order. */
  tx: Tx;
  /** Underlying calls executed (returned for inspection / re-use). */
  calls: Call[];
  /** ERC20 receive address the tokens were transferred to. */
  receiveAddress: string;
  /** Sender API order metadata. */
  providerAccount?: PaycrestProviderAccount;
  /** Caller-supplied rate forwarded in the order body, if any. */
  rate?: string;
  /**
   * Wait for fiat settlement by polling `GET /v2/sender/orders/{id}`.
   * Equivalent to `paycrest.waitForOrder(result.orderId, options)`.
   *
   * Resolves with the final order once a success terminal is reached
   * (`validated` or `settled`); throws `PaycrestOrderError` on
   * `refunded` / `expired`. See `PaycrestWaitForOrderOptions` for
   * tuning.
   *
   * Memoized only on success: a second call while one is in flight (or
   * after it resolved) reuses it, ignoring the new options; a failed
   * wait is dropped so the next call polls again.
   */
  wait(options?: PaycrestWaitForOrderOptions): Promise<PaycrestOrder>;
}

/** Result returned by `Paycrest.onramp(...)`. */
export interface OnrampResult {
  orderId: string;
  status: PaycrestOrderStatus;
  providerAccount: PaycrestProviderAccount;
  validUntil?: string;
  reference?: string;
}

/** Re-export `ExecuteOptions` so callers don't need to dig into `@/types`. */
export type PaycrestExecuteOptions = ExecuteOptions;

/**
 * Options for `Paycrest.waitForOrder(...)`. Mirrors the shape of
 * `Tx.wait(WaitOptions)` — pass `successStates: []` to disable the
 * built-in success terminals, or `errorStates: []` to never throw on
 * refund/expiry (the order is returned regardless).
 */
export interface PaycrestWaitForOrderOptions {
  /**
   * Statuses that resolve the wait as success.
   * Default: `["validated", "settled"]`.
   *
   * Off-ramp completion is conventionally `validated` (provider has
   * confirmed fiat delivery); on-ramp completion is `settled` (tokens
   * released). The default covers both directions.
   */
  successStates?: PaycrestOrderStatus[];
  /**
   * Statuses that reject the wait as failure.
   * Default: `["refunded", "expired"]`.
   */
  errorStates?: PaycrestOrderStatus[];
  /** Polling interval in milliseconds. Default: 5000. */
  pollIntervalMs?: number;
  /** Total wait timeout in milliseconds. Default: 600000 (10 min). */
  timeoutMs?: number;
  /** AbortSignal to cancel the wait early. */
  signal?: AbortSignal;
}
