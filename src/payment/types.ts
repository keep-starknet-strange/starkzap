import { AmountSymbols, Bridges, Chains } from "@chainrails/sdk";
import type {
  Bridge,
  AmountSymbol,
  Chain,
  Network,
  PaymentOption as ChainrailsPaymentOption,
  Quote,
  Status,
} from "@chainrails/sdk";
import { crapi } from "@chainrails/sdk";

type AsyncResult<T extends (...args: never[]) => unknown> = Awaited<
  ReturnType<T>
>;

// Re-export AsyncResult for use in payment module
export type { AsyncResult };

// ─── Environment ───────────────────────────────

/** Chainrails API environment. */
export type PaymentEnvironment = "production" | "staging";

// ─── Chains ────────────────────────────────────

/** Supported chain aliases. */
export const PaymentChains = Chains;

/** A supported chain alias (e.g. `"STARKNET"`, `"BASE"`). */
export type PaymentChain = Chain;

/** Internal chain identifier used by Chainrails API. */
export type InternalPaymentChain = PaymentIntent["sourceChain"];

/** Chain type (EVM or Starknet). */
export type PaymentChainType = NonNullable<GetChainBalanceInput["chainType"]>;

/** Network variant. */
export type PaymentNetwork = Network;

// ─── Tokens / Amount Symbols ───────────────────

/** Supported settlement / amount symbols. */
export const PaymentTokenSymbols = AmountSymbols;

/** A supported token symbol. */
export type PaymentTokenSymbol = AmountSymbol;

// ─── Bridges ───────────────────────────────────

/** Supported cross-chain bridge protocols. */
export const PaymentBridges = Bridges;

/** A supported bridge protocol. */
export type PaymentBridge = Bridge;

// ─── Intent Status ─────────────────────────────

/**
 * Lifecycle status of a payment intent.
 *
 * - `PENDING`   – Created, waiting for deposit.
 * - `FUNDED`    – Deposit detected on source chain.
 * - `INITIATED` – Cross-chain relay/bridge started.
 * - `COMPLETED` – Settlement confirmed on destination chain.
 * - `EXPIRED`   – TTL exceeded without funding.
 */
export type PaymentIntentStatus = Status;

// ─── Configuration ─────────────────────────────

/**
 * Configuration for the Payment module.
 *
 * @example
 * ```ts
 * const sdk = new StarkZap({
 *   network: "mainnet",
 *   payment: {
 *     apiKey: "cr_live_...",
 *   },
 * });
 * ```
 */
export interface PaymentConfig {
  /** Chainrails API key. */
  apiKey: string;
  /** API environment – defaults to `"production"`. */
  environment?: PaymentEnvironment;
}

// ─── Modal ───────────────────────────────────

/** Supported payment modal platforms. */
export type PaymentModalPlatform = "web" | "mobile";

/** Input for creating a payment modal flow. */
export interface PaymentModalInput {
  sessionToken: string;
  amount?: string;
  platform?: PaymentModalPlatform;
}

/** Returned modal handle with a one-call payment trigger. */
export interface PaymentModalHandle {
  sessionToken: string;
  amount?: string;
  pay: () => Promise<boolean>;
}

// ─── Quote types ───────────────────────────────

/** A single payment option within a quote. */
export type PaymentOption = ChainrailsPaymentOption;

/** A quote for a specific source → destination route. */
export type PaymentQuote = Quote;

/**
 * Input for fetching a quote from a specific bridge.
 */
export type GetQuoteFromBridgeInput = Parameters<
  typeof crapi.quotes.getFromSpecificBridge
>[0];

/** Output of a single-bridge quote request. */
export type GetQuoteFromBridgeOutput = AsyncResult<
  typeof crapi.quotes.getFromSpecificBridge
>;

/**
 * Input for fetching quotes from all available bridges.
 */
export interface GetQuotesFromAllBridgesInput {
  sourceChain: PaymentChain;
  destinationChain: PaymentChain;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amount: string;
  excludeBridges?: string;
  /** Comma-separated chains to exclude (e.g. `"BASE_TESTNET,STARKNET_TESTNET"`). */
  excludeChains?: string;
  recipient: `0x${string}`;
  amountSymbol?: PaymentTokenSymbol;
}

/** Output of a multi-bridge quote request. */
export type GetQuotesFromAllBridgesOutput = AsyncResult<
  typeof crapi.quotes.getFromAllBridges
>;

/**
 * Input for fetching the best quote across all bridges.
 */
export type GetBestQuoteInput = Parameters<
  typeof crapi.quotes.getBestAcrossBridges
>[0];

/** Output of a best-quote request. */
export type GetBestQuoteOutput = AsyncResult<
  typeof crapi.quotes.getBestAcrossBridges
>;

/**
 * Input for fetching quotes from all source chains.
 */
export type GetQuotesInput = Parameters<typeof crapi.quotes.getAll>[0];

/** Output of a multi-source quote request. */
export type GetQuotesOutput = AsyncResult<typeof crapi.quotes.getAll>;

/**
 * Input for fetching quotes for a session.
 */
export type GetSessionQuotesInput = Parameters<
  typeof crapi.quotes.getAllForSession
>[0];

/** Output of a session quote request. */
export type GetSessionQuotesOutput = AsyncResult<
  typeof crapi.quotes.getAllForSession
>;

// ─── Intent types ──────────────────────────────

/**
 * Normalized payment intent with camelCase field names.
 * Wraps the Chainrails Intent to provide SDK-native naming conventions.
 */
export interface PaymentIntent {
  /** Unique intent identifier */
  id: string;
  /** On-chain intent contract address */
  intentAddress: string;
  /** Current intent status */
  intentStatus:
    | "PENDING"
    | "FUNDED"
    | "INITIATED"
    | "COMPLETED"
    | "EXPIRED"
    | "REFUNDED";
  /** Sender address on source chain */
  sender: string;
  /** Recipient address on destination chain */
  recipient: string;
  /** Token used for payment */
  tokenIn: string;
  /** Token symbol (e.g., "USDC") */
  amountSymbol: string;
  /** Payment amount */
  amount: string;
  /** Source chain */
  sourceChain: string;
  /** Destination chain */
  destinationChain: string;
  /** Address for refunds */
  refundAddress: string;
  /** Additional metadata */
  metadata:
    | {
        description: string;
        reference: string;
      }
    | undefined;
  /** Timestamp when intent was created */
  createdAt: string | undefined;
  /** Timestamp when intent expires */
  expiresAt: string | undefined;
}

/**
 * Input for creating a payment intent with camelCase field names.
 * Normalizes Chainrails snake_case fields to SDK-native camelCase.
 */
export interface CreatePaymentIntentInput {
  /** Sender address */
  sender: `0x${string}`;
  /** Payment amount */
  amount: string;
  /** Input token address */
  tokenIn: `0x${string}`;
  /** Token symbol (e.g., "USDC") */
  amountSymbol: PaymentTokenSymbol;
  /** Source chain */
  sourceChain: string;
  /** Destination chain */
  destinationChain: string;
  /** Recipient address on destination chain */
  recipient: `0x${string}`;
  /** Address for refunds */
  refundAddress: `0x${string}`;
  /** Additional metadata */
  metadata: {
    description: string;
    reference: string;
  };
}

/** Input for creating a session-based payment intent. */
export type CreateSessionIntentInput = Parameters<
  typeof crapi.intents.createForSession
>[0];

/** Input for listing all intents with pagination. */
export type ListPaymentIntentsInput = Parameters<
  typeof crapi.intents.getAll
>[0];

/** Paginated intent list. */
export type ListPaymentIntentsOutput = AsyncResult<typeof crapi.intents.getAll>;

/** Result of triggering intent processing. */
export type TriggerProcessingOutput = AsyncResult<
  typeof crapi.intents.triggerProcessing
>;

// ─── Router types ──────────────────────────────

/** Input for finding the optimal cross-chain route. */
export type GetOptimalRouteInput = Parameters<
  typeof crapi.router.getOptimalRoutes
>[0];

/** Optimal route output. */
export type GetOptimalRouteOutput = AsyncResult<
  typeof crapi.router.getOptimalRoutes
>;

/** Input for querying supported bridges on a route. */
export type GetSupportedBridgesInput = Parameters<
  typeof crapi.router.getSupportedBridges
>[0];

/** Supported bridges output. */
export type GetSupportedBridgesOutput = AsyncResult<
  typeof crapi.router.getSupportedBridges
>;

/** All supported bridges output. */
export type GetAllSupportedBridgesOutput = AsyncResult<
  typeof crapi.router.getAllSupportedBridges
>;

// ─── Chains service types ──────────────────────

/** Input for querying supported chains. */
export type GetSupportedChainsInput = Parameters<
  typeof crapi.chains.getSupported
>[0];

/** Input for querying an address balance. */
export type GetChainBalanceInput = Parameters<
  typeof crapi.chains.getBalance
>[0];

// ─── Auth / Session types ──────────────────────

/** Input for creating a payment session. */
export type CreatePaymentSessionInput = Parameters<
  typeof crapi.auth.getSessionToken
>[0];

/** Output of session creation. */
export type PaymentSessionOutput = AsyncResult<
  typeof crapi.auth.getSessionToken
>;

// ─── Client Info ───────────────────────────────

/** Merchant / client information. */
export type PaymentClientInfo = AsyncResult<typeof crapi.client.getClientInfo>;

// ─── Ramp / Fiat Onramp types ───────────────────

/** Supported ramp/fiat onramp providers. */
export const PaymentRampProviders = {
  FONBNK: "FONBNK",
  ONRAMP_MONEY: "ONRAMP_MONEY",
} as const;

/** A supported ramp provider. */
export type PaymentRampProvider =
  (typeof PaymentRampProviders)[keyof typeof PaymentRampProviders];

/** Ramp order status. */
export const PaymentRampOrderStatuses = {
  PENDING: "PENDING",
  INITIATED: "INITIATED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
} as const;

/** A ramp order status. */
export type PaymentRampOrderStatus =
  (typeof PaymentRampOrderStatuses)[keyof typeof PaymentRampOrderStatuses];

/** Payment channel for ramp (bank transfer, card, mobile money, wallet). */
export interface PaymentRampPaymentChannel {
  id: string;
  name: string;
  type: "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY" | "WALLET";
  currency: string;
  minAmount: number;
  maxAmount: number;
  fees: {
    fixed: number;
    percentage: number;
  };
}

/** A ramp quote for fiat-to-crypto conversion. */
export interface PaymentRampQuote {
  provider: PaymentRampProvider;
  fiatCurrency: string;
  fiatAmount: number;
  cryptoCurrency: string;
  cryptoAmount: number;
  exchangeRate: number;
  totalFeesFiat: number;
  totalFeesUsd: number;
  paymentChannels: PaymentRampPaymentChannel[];
  rampChain: string;
  requiresBridge: boolean;
  bridgeDetails?: {
    bridgeProvider: string;
    bridgeFeeUsd: number;
    sourceChain: string;
    destinationChain: string;
  };
}

/** Input for getting ramp quotes. */
export type GetRampQuotesInput = Parameters<typeof crapi.ramp.getQuotes>[0];

/** Output of ramp quote request. */
export type GetRampQuotesOutput = AsyncResult<typeof crapi.ramp.getQuotes>;

/** Input for getting ramp quotes for a session. */
export type GetRampSessionQuotesInput = Parameters<
  typeof crapi.ramp.getQuotesForSession
>[0];

/** Output of session ramp quote request. */
export type GetRampSessionQuotesOutput = AsyncResult<
  typeof crapi.ramp.getQuotesForSession
>;

/** Input for getting supported ramp countries. */
export type GetRampCountriesInput = Parameters<
  typeof crapi.ramp.getCountries
>[0];

/** Output of ramp countries request. */
export type GetRampCountriesOutput = AsyncResult<
  typeof crapi.ramp.getCountries
>;

/** Input for getting supported ramp currencies. */
export type GetRampCurrenciesInput = Parameters<
  typeof crapi.ramp.getCurrencies
>[0];

/** Output of ramp currencies request. */
export type GetRampCurrenciesOutput = AsyncResult<
  typeof crapi.ramp.getCurrencies
>;

/** Input for creating a ramp order. */
export type CreateRampOrderInput = Parameters<typeof crapi.ramp.createOrder>[0];

/** Output of ramp order creation. */
export type CreateRampOrderOutput = AsyncResult<typeof crapi.ramp.createOrder>;

/** Input for creating a ramp order for a session. */
export type CreateRampSessionOrderInput = Parameters<
  typeof crapi.ramp.createOrderForSession
>[0];

/** Output of session ramp order creation. */
export type CreateRampSessionOrderOutput = AsyncResult<
  typeof crapi.ramp.createOrderForSession
>;

/** A ramp order. */
export type PaymentRampOrder = AsyncResult<typeof crapi.ramp.getOrder>;

/** Input for listing ramp orders. */
export type ListRampOrdersInput = Parameters<typeof crapi.ramp.listOrders>[0];

/** Output of ramp orders list request. */
export type ListRampOrdersOutput = AsyncResult<typeof crapi.ramp.listOrders>;
