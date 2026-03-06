import { AmountSymbols, Bridges, Chains } from "@chainrails/sdk";
import type {
  Bridge,
  AmountSymbol,
  Chain,
  Intent,
  Network,
  PaymentOption as ChainrailsPaymentOption,
  Quote,
  Status,
} from "@chainrails/sdk";
import { crapi } from "@chainrails/sdk";

type AsyncResult<T extends (...args: never[]) => unknown> = Awaited<
  ReturnType<T>
>;

// ─── Environment ───────────────────────────────

/** Chainrails API environment. */
export type PaymentEnvironment = "production" | "staging";

// ─── Chains ────────────────────────────────────

/** Supported chain aliases. */
export const PaymentChains = Chains;

/** A supported chain alias (e.g. `"STARKNET"`, `"BASE"`). */
export type PaymentChain = Chain;

/** Internal chain identifier used by Chainrails API. */
export type InternalPaymentChain = PaymentIntent["source_chain"];

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
  platform: PaymentModalPlatform;
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
export type GetAllQuotesInput = Parameters<typeof crapi.quotes.getAll>[0];

/** Output of a multi-source quote request. */
export type GetAllQuotesOutput = AsyncResult<typeof crapi.quotes.getAll>;

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

/** A fully resolved payment intent. */
export type PaymentIntent = Intent;

/** Input for creating a payment intent. */
export type CreatePaymentIntentInput = Parameters<
  typeof crapi.intents.create
>[0];

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
