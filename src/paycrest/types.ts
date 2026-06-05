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

/** Off-ramp transport: on-chain via the Cairo Gateway, or REST via the Sender API. */
export type PaycrestPath = "gateway" | "api";

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
 * Smaller shape returned by `GET /v2/orders/{chain_id}/{gateway_id}`
 * (the aggregator's `GetProviderOrderStatus` endpoint). Used to look
 * up gateway-path off-ramp orders by their on-chain felt252 id when
 * the DB UUID isn't known.
 *
 * Field set is a subset of `PaycrestOrder` — there's no `id` (UUID),
 * no `providerAccount`, no `direction`. The `orderId` field carries
 * the gateway_id you used to look it up.
 */
export interface PaycrestProviderOrderStatus {
  orderId: string;
  status: PaycrestOrderStatus;
  amount?: string;
  amountInUSD?: string;
  token?: string;
  /**
   * Paycrest network identifier as returned by the API.
   *
   * Typed as `PaycrestNetwork | string` intentionally: Paycrest may
   * ship new network identifiers (e.g. `"asset-chain"`) before a SDK
   * release catches up, and this field must keep passing raw responses
   * through. Callers can narrow against `PaycrestNetwork` themselves
   * if they need strict handling.
   */
  network?: PaycrestNetwork | string;
  txHash?: string;
  settlements?: unknown[];
  txReceipts?: unknown[];
}

/**
 * Unified result returned by `OfframpResult.wait()` — abstracts over
 * the two endpoints used internally (`/v2/sender/orders/{id}` for the
 * api path, `/v2/orders/{chain_id}/{gateway_id}` for the gateway
 * path). The `raw` field carries the underlying response if you need
 * fields beyond status/txHash.
 */
interface PaycrestOfframpStatusBase {
  /** Whichever id was used to look up the order (UUID for api, felt252 for gateway). */
  orderId: string;
  status: PaycrestOrderStatus;
  txHash?: string;
}

/**
 * Discriminated on `path`: the api path carries the full `PaycrestOrder`
 * in `raw`, the gateway path the smaller `PaycrestProviderOrderStatus`.
 * Narrow on `status.path` to access the correct `raw` shape.
 */
export type PaycrestOfframpStatus =
  | (PaycrestOfframpStatusBase & { path: "api"; raw: PaycrestOrder })
  | (PaycrestOfframpStatusBase & {
      path: "gateway";
      raw: PaycrestProviderOrderStatus;
    });

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
 * Pluggable encryptor used for the Gateway path. The default
 * implementation is RSA PKCS1 v1.5 (matching the aggregator's Go
 * `crypto/rsa.DecryptPKCS1v15`) — `node:crypto.publicEncrypt` in
 * Node/Bun/SSR, a BigInt-based PKCS1 v1.5 + raw RSA fallback in
 * browsers/RN where WebCrypto can't do PKCS1 v1.5. See `encryption.ts`.
 * Inject a custom function only if you need a non-default RSA library.
 */
export type PaycrestEncryptor = (
  publicKeyPem: string,
  plaintext: string
) => Promise<string>;

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
   * (`listCurrencies`, `listInstitutions`, `listTokens`, `getRate`,
   * `getProviderOrderStatus`) work without one. Order-creating calls
   * (`createOrder`, `getOrder`, `listOrders`, plus `offramp` /
   * `onramp` which call them internally) throw a clear runtime error
   * if omitted.
   */
  apiKey?: string;
  /** Paycrest API secret. Required only for `Paycrest.verifyWebhookSignature`. */
  apiSecret?: string;
  /** Override the API base URL. Defaults to `https://api.paycrest.io`. */
  apiBaseUrl?: string;
  /**
   * Override the Cairo Gateway contract address. Defaults to the
   * mainnet preset. Useful for local forking or future redeployments.
   */
  gatewayAddress?: Address;
  /** Inject a `fetch` implementation (testing or custom HTTP runtime). */
  fetch?: typeof fetch;
  /** Inject a custom recipient encryptor (default: built-in RSA PKCS1 v1.5). */
  encryptRecipient?: PaycrestEncryptor;
  /** Per-request timeout in milliseconds. Defaults to 15000. */
  requestTimeoutMs?: number;
}

/**
 * Per-order sender-fee override for the Sender API (api-path off-ramp and
 * on-ramp). Overrides the fee configured on your Paycrest Sender
 * Dashboard for this single order.
 *
 * Provide exactly one of `amount` or `percent` — they are mutually
 * exclusive (the API rejects both). The fee **recipient** is always your
 * dashboard-configured fee address and cannot be set per-order.
 *
 * Not applicable to the gateway path, which carries its fee on-chain via
 * `OfframpInput.senderFee` — passing `senderFeeOverride` there throws.
 */
export type PaycrestSenderFeeOverride =
  | {
      /** Fixed fee in token units. Maps to the API `senderFee` field. */
      amount: Amount;
    }
  | {
      /**
       * Fee percentage of the order amount (e.g. `0.5` for 0.5%). Maps to
       * the API `senderFeePercent` field; capped server-side by your
       * token's max-fee config.
       */
      percent: number | string;
    };

/**
 * Input to `Paycrest.offramp(wallet, input)`.
 *
 * `path` defaults to `"gateway"`. The two paths surface the same shape
 * to the caller; internally:
 *   - `gateway` path: encrypts recipient details, fetches a rate, and
 *     emits an approve + create_order Call pair on-chain.
 *   - `api` path: POSTs to `/v2/sender/orders`, returns the receive
 *     address, and emits a single ERC20 transfer Call to that address.
 */
export interface OfframpInput {
  path?: PaycrestPath;
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
   * Optional pre-fetched rate. Honored on both paths — the API path
   * forwards it in the `POST /v2/sender/orders` body, the gateway path
   * uses it in the on-chain `create_order` call (skipping a redundant
   * `/v2/rates` fetch when omitted, it falls back to fetching).
   */
  rate?: string;
  /**
   * Optional sender fee — **gateway path only**. Defaults to zero address
   * + `0n`. When set, the approve amount becomes `amount + senderFee` and
   * the fee + recipient are passed to the on-chain `create_order`.
   *
   * Not supported on the `api` path: the Sender API computes its own
   * `senderFee` + `transactionFee` (from your Paycrest Sender Dashboard
   * config, or a `senderFeePercent` override) and returns them in the
   * order; the SDK then transfers `amount + senderFee + transactionFee`
   * to the receive address. Passing `senderFee` with `path: "api"`
   * throws.
   */
  senderFee?: {
    recipient: Address;
    amount: bigint;
  };
  /**
   * Per-order sender-fee override (**api path only**). Overrides your
   * Sender Dashboard fee config for this order. Passing it with the
   * gateway path throws — use `senderFee` for the on-chain fee instead.
   * See {@link PaycrestSenderFeeOverride}.
   */
  senderFeeOverride?: PaycrestSenderFeeOverride;
}

/** Input to `Paycrest.onramp(input)`. On-ramp is API-path only. */
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

/** Fields shared by both off-ramp paths. */
interface OfframpResultBase {
  /**
   * Resolves to the order id once it's known.
   *
   * - **api path**: resolves immediately to the UUID returned by `POST
   *   /v2/sender/orders` — already known when `offramp()` returns.
   * - **gateway path**: resolves to the felt252 hex order id parsed
   *   from the `OrderCreated` event after the transaction confirms.
   *   Internally waits for the L2 receipt; you do **not** need to call
   *   `tx.wait()` separately before awaiting `orderId`. Resolves to
   *   `null` if the receipt has no `OrderCreated` event (e.g. tx
   *   reverted — check `tx.wait()` for the failure reason).
   */
  orderId: Promise<string | null>;
  tx: Tx;
  /** Underlying calls executed (returned for inspection / re-use). */
  calls: Call[];
  /**
   * Wait for fiat settlement. Polls the correct aggregator endpoint
   * based on `path`:
   *
   * - **api path** uses `GET /v2/sender/orders/{uuid}` (full order).
   * - **gateway path** uses `GET /v2/orders/{chain_id}/{gateway_id}`
   *   (smaller status-only shape — the Sender API endpoint doesn't
   *   index gateway_id).
   *
   * Resolves with the unified status when a success terminal is
   * reached (`validated` or `settled`); throws `PaycrestOrderError`
   * on `refunded` / `expired`. See `PaycrestWaitForOrderOptions` for
   * tuning.
   *
   * Memoized: calling `wait()` more than once reuses the first call's
   * polling loop (and its options) rather than starting a second.
   */
  wait(options?: PaycrestWaitForOrderOptions): Promise<PaycrestOfframpStatus>;
}

/**
 * Result returned by `Paycrest.offramp(...)`. Discriminated on `path`:
 * the gateway path always carries the on-chain `rate`; the api path
 * carries the assigned `receiveAddress` (and optional `providerAccount`).
 * Narrow on `result.path` before reaching for path-specific fields.
 */
export type OfframpResult =
  | (OfframpResultBase & {
      path: "gateway";
      /**
       * Rate used for the on-chain order. Either the caller-supplied
       * `input.rate` or the rate fetched from `/v2/rates` when omitted.
       */
      rate: string;
    })
  | (OfframpResultBase & {
      path: "api";
      /** ERC20 receive address the tokens were transferred to. */
      receiveAddress: string;
      /** Sender API order metadata. */
      providerAccount?: PaycrestProviderAccount;
      /** Caller-supplied rate forwarded in the order body, if any. */
      rate?: string;
    });

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

/**
 * On-chain `Order` struct returned by the Cairo Gateway's `get_order_info`.
 * Mirrors `paycrest::interfaces::IGateway::Order`.
 */
export interface PaycrestOrderInfo {
  sender: Address;
  token: Address;
  senderFeeRecipient: Address;
  senderFee: bigint;
  protocolFee: bigint;
  isFulfilled: boolean;
  isRefunded: boolean;
  refundAddress: Address;
  currentBps: bigint;
  amount: bigint;
}
