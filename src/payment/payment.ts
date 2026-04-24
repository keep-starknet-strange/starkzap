/**
 * Payment module — cross-chain, multi-token payment acceptance via Chainrails.
 *
 * Provides quote discovery, intent lifecycle management, bridge routing,
 * chain/balance queries, session-based payment flows, and merchant info.
 *
 * @example
 * ```ts
 * import { StarkZap } from "starkzap";
 *
 * const sdk = new StarkZap({
 *   network: "mainnet",
 *   payment: { apiKey: "cr_live_..." },
 * });
 *
 * const payment = sdk.payment();
 *
 * // Get quotes from all source chains
 * const quotes = await payment.getQuotes({
 *   destinationChain: "STARKNET",
 *   tokenOut: "0x053c91...",
 *   amount: "10",
 *   recipient: "0xabc...",
 * });
 *
 * // Create a payment intent
 * const intent = await payment.createIntent({
 *   sender: "0xsender...",
 *   amount: "10",
 *   tokenIn: "0xtokenIn...",
 *   amountSymbol: "USDC",
 *   source_chain: "BASE",
 *   destination_chain: "STARKNET",
 *   recipient: "0xrecipient...",
 *   refund_address: "0xsender...",
 *   metadata: { description: "Order #42", reference: "order-42" },
 * });
 * ```
 */

import type {
  CreatePaymentIntentInput,
  CreateRampOrderInput,
  CreateRampSessionOrderInput,
  CreateSessionIntentInput,
  GetAllSupportedBridgesOutput,
  GetBestQuoteInput,
  GetBestQuoteOutput,
  GetChainBalanceInput,
  // Router
  GetOptimalRouteInput,
  // Quotes
  GetQuoteFromBridgeInput,
  GetQuotesFromAllBridgesInput,
  GetQuotesInput,
  GetQuotesOutput,
  GetRampCountriesInput,
  GetRampCurrenciesInput,
  // Ramp
  GetRampQuotesInput,
  GetRampQuotesOutput,
  GetRampSessionQuotesInput,
  GetSessionQuotesInput,
  GetSupportedBridgesInput,
  // Chains
  GetSupportedChainsInput,
  ListPaymentIntentsInput,
  ListRampOrdersInput,
  PaymentBridge,
  // Client
  PaymentClientInfo,
  PaymentConfig,
  // Intents
  PaymentIntent,
  PaymentIntentStatus,
  PaymentModalHandle,
  PaymentModalInput,
  PaymentRampOrder,
} from "@/payment/types";
import { Chainrails, crapi } from "@chainrails/sdk";
import { Session } from "./session";

/**
 * Cross-chain payment module powered by Chainrails.
 *
 * Accept payments from any chain, any token (EVM + Starknet), with automatic
 * bridge routing, fee quoting, and intent-based settlement.
 */
export class Payment {
  private modalManagerPromise: Promise<{
    checkout: (input: PaymentModalInput) => PaymentModalHandle;
  }> | null = null;

  /** Stored session token from the most recent `createSession` call. */
  private currentSessionToken: string | null = null;

  /** Whether this Payment instance was configured with an apiKey. */
  private readonly configured: boolean;

  /** Promise that resolves when Chainrails is configured. */
  private configPromise: Promise<unknown> | null = null;

  session: Session;

  constructor(config: PaymentConfig) {
    this.configured = !!config.apiKey;
    this.configPromise = Chainrails.config({
      api_key: config.apiKey ?? "",
      env: config.environment ?? "production",
    });

    this.session = new Session(this);
  }

  /**
   * Ensure Chainrails is configured before making API calls.
   * Throws if Payment was not configured with an apiKey.
   */
  async ensureConfigured(): Promise<void> {
    if (!this.configured) {
      throw new Error(
        "Payment was not configured with an apiKey — either pass `payment: { apiKey }` to `new StarkZap()` or only use `checkout()` with a server-minted session token"
      );
    }
    if (this.configPromise) {
      await this.configPromise;
    }
  }

  getSessionToken(): string | null {
    return this.currentSessionToken;
  }

  setSessionToken(sessionToken: string): void {
    this.currentSessionToken = sessionToken;
  }

  private getModalManager(): Promise<{
    checkout: (input: PaymentModalInput) => PaymentModalHandle;
  }> {
    if (!this.modalManagerPromise) {
      this.modalManagerPromise = import("@/payment/checkout").then(
        ({ PaymentModalManager }) => new PaymentModalManager()
      );
    }

    return this.modalManagerPromise;
  }

  // ══════════════════════════════════════════════
  // Helper methods
  // ══════════════════════════════════════════════

  /**
   * Normalize Chainrails snake_case intent to camelCase PaymentIntent.
   */
  private normalizeIntent(result: {
    id: string;
    intent_address: string;
    intent_status: string;
    sender: string;
    recipient: string;
    token_in: string;
    amount_symbol: string;
    amount: string;
    source_chain: string;
    destination_chain: string;
    refund_address: string;
    metadata?: { description: string; reference: string };
    created_at?: string;
    expires_at?: string;
  }): PaymentIntent {
    return {
      id: result.id,
      intentAddress: result.intent_address,
      intentStatus: result.intent_status as PaymentIntent["intentStatus"],
      sender: result.sender,
      recipient: result.recipient,
      tokenIn: result.token_in,
      amountSymbol: result.amount_symbol,
      amount: result.amount,
      sourceChain: result.source_chain,
      destinationChain: result.destination_chain,
      refundAddress: result.refund_address,
      metadata: result.metadata,
      createdAt: result.created_at,
      expiresAt: result.expires_at,
    };
  }

  // ══════════════════════════════════════════════
  // Sessions / Auth
  // ══════════════════════════════════════════════

  /**
   * Create a payment modal handle.
   *
   * Call `.pay()` on the returned object to open the modal and resolve with:
   * - `true` on successful payment
   * - `false` on cancel/close
   */
  checkout(input: PaymentModalInput): PaymentModalHandle {
    const handle: PaymentModalHandle = {
      sessionToken: input.sessionToken,
      pay: async () => {
        const modalManager = await this.getModalManager();
        return modalManager.checkout({ ...input }).pay();
      },
    };

    if (input.amount !== undefined) {
      handle.amount = input.amount;
    }

    return handle;
  }

  // ══════════════════════════════════════════════
  // Quotes
  // ══════════════════════════════════════════════

  /**
   * Get a quote from a specific bridge.
   */
  async getQuoteFromBridge(input: GetQuoteFromBridgeInput) {
    await this.ensureConfigured();
    return crapi.quotes.getFromSpecificBridge(input);
  }

  /**
   * Get quotes from all available bridges for a route.
   */
  async getQuotesFromAllBridges(input: GetQuotesFromAllBridgesInput) {
    await this.ensureConfigured();
    return crapi.quotes.getFromAllBridges({
      ...input,
      excludeBridges: input.excludeBridges ?? "",
    });
  }

  /**
   * Get the single best quote across all bridges for a route.
   */
  async getBestQuote(input: GetBestQuoteInput): Promise<GetBestQuoteOutput> {
    await this.ensureConfigured();
    return crapi.quotes.getBestAcrossBridges(input);
  }

  /**
   * Get quotes from all possible source chains for a destination.
   *
   * This is the easiest way to discover every path a payer can use.
   */
  async getQuotes(input: GetQuotesInput): Promise<GetQuotesOutput> {
    await this.ensureConfigured();
    return crapi.quotes.getAll(input);
  }

  /**
   * Get quotes for the current session (requires prior `createSession` call).
   */
  async getSessionQuotes(input: GetSessionQuotesInput) {
    await this.ensureConfigured();
    return crapi.quotes.getAllForSession(input);
  }

  // ══════════════════════════════════════════════
  // Intents
  // ══════════════════════════════════════════════

  /**
   * Create a payment intent.
   *
   * An intent represents a concrete payment: sender deposits on the source
   * chain, and Chainrails settles the destination amount automatically.
   */
  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
    // Convert camelCase input to snake_case for Chainrails API
    const snakeCaseInput = {
      sender: input.sender,
      amount: input.amount,
      tokenIn: input.tokenIn,
      amountSymbol: input.amountSymbol,
      source_chain: input.sourceChain,
      destination_chain: input.destinationChain,
      recipient: input.recipient,
      refund_address: input.refundAddress,
      metadata: input.metadata,
    };

    // Call Chainrails API with snake_case and normalize the response
    await this.ensureConfigured();
    const result = await crapi.intents.create(snakeCaseInput);
    return this.normalizeIntent(result);
  }

  /**
   * Create a session-based payment intent.
   */
  async createSessionIntent(input: CreateSessionIntentInput) {
    await this.ensureConfigured();
    const result = await crapi.intents.createForSession(input);
    return this.normalizeIntent(result);
  }

  /**
   * Get a payment intent by its ID.
   */
  async getIntent(id: string): Promise<PaymentIntent> {
    await this.ensureConfigured();
    const result = await crapi.intents.getById(id);
    return this.normalizeIntent(result);
  }

  /**
   * Get a payment intent by its on-chain address.
   */
  async getIntentByAddress(address: `0x${string}`): Promise<PaymentIntent> {
    await this.ensureConfigured();
    const result = await crapi.intents.getForAddress(address);
    return this.normalizeIntent(result);
  }

  /**
   * Get all intents for a sender address.
   */
  async getIntentsForSender(sender: `0x${string}`): Promise<PaymentIntent[]> {
    await this.ensureConfigured();
    const results = await crapi.intents.getForSender(sender);
    return results.map((result) => this.normalizeIntent(result));
  }

  /**
   * List all intents with pagination and optional status filter.
   */
  async listIntents(input?: ListPaymentIntentsInput) {
    await this.ensureConfigured();
    const result = await crapi.intents.getAll(input ?? {});
    // Normalize intents in the response without mutating upstream
    return {
      ...result,
      intents: result.intents?.map((result) => this.normalizeIntent(result)),
    };
  }

  /**
   * Get all intents for the current session.
   */
  async getSessionIntents(address: `0x${string}`): Promise<PaymentIntent[]> {
    await this.ensureConfigured();
    const results = await crapi.intents.getForSession(address);
    return results.map((result: Parameters<typeof this.normalizeIntent>[0]) =>
      this.normalizeIntent(result)
    );
  }

  /**
   * Update the status of a payment intent.
   */
  async updateIntentStatus(id: string, status: PaymentIntentStatus) {
    await this.ensureConfigured();
    const result = await crapi.intents.update(id, { status });
    return this.normalizeIntent(result);
  }

  /**
   * Trigger processing (relay / settlement) of a funded intent.
   */
  async triggerProcessing(intentAddress: `0x${string}`) {
    await this.ensureConfigured();
    return crapi.intents.triggerProcessing(intentAddress);
  }

  /**
   * Trigger processing for a session-based intent.
   */
  async triggerSessionProcessing(intentAddress: `0x${string}`) {
    await this.ensureConfigured();
    return crapi.intents.triggerProcessingForSession(intentAddress);
  }

  // ══════════════════════════════════════════════
  // Router
  // ══════════════════════════════════════════════

  /**
   * Find the optimal cross-chain route (bridge + fees).
   */
  async getOptimalRoute(input: GetOptimalRouteInput) {
    await this.ensureConfigured();
    return crapi.router.getOptimalRoutes(input);
  }

  /**
   * Get all bridge protocols supported by Chainrails.
   */
  async getAllSupportedBridges(): Promise<GetAllSupportedBridgesOutput> {
    await this.ensureConfigured();
    return crapi.router.getAllSupportedBridges();
  }

  /**
   * Get bridges available for a specific source → destination route.
   */
  async getSupportedBridges(input: GetSupportedBridgesInput) {
    await this.ensureConfigured();
    return crapi.router.getSupportedBridges(input);
  }

  /**
   * Get all routes supported by a specific bridge.
   */
  async getSupportedRoutes(bridge: PaymentBridge) {
    await this.ensureConfigured();
    return crapi.router.getSupportedRoutes(bridge);
  }

  // ══════════════════════════════════════════════
  // Chains
  // ══════════════════════════════════════════════

  /**
   * Get chains supported for payments.
   */
  async getSupportedChains(input?: GetSupportedChainsInput): Promise<string[]> {
    await this.ensureConfigured();
    return crapi.chains.getSupported(input);
  }

  /**
   * Get token balances for an address across chains.
   */
  async getBalance(input: GetChainBalanceInput): Promise<string> {
    await this.ensureConfigured();
    return crapi.chains.getBalance(input);
  }

  // ══════════════════════════════════════════════
  // Client / Merchant Info
  // ══════════════════════════════════════════════

  /**
   * Get merchant/client account information.
   */
  async getClientInfo(): Promise<PaymentClientInfo> {
    await this.ensureConfigured();
    return crapi.client.getClientInfo();
  }

  /**
   * Get client info for the current session.
   */
  async getSessionClientInfo(): Promise<PaymentClientInfo> {
    await this.ensureConfigured();
    return crapi.client.getClientInfoForSession();
  }

  // ══════════════════════════════════════════════
  // Ramp / Fiat Onramp
  // ══════════════════════════════════════════════

  /**
   * Get aggregated fiat-to-crypto quotes from all eligible providers.
   *
   * @example
   * ```ts
   * const quotes = await payment.ramp.getQuotes({
   *   fiatCurrency: "USD",
   *   cryptoAmount: 100,
   *   destinationChain: "STARKNET",
   * });
   * ```
   */
  async getRampQuotes(input: GetRampQuotesInput): Promise<GetRampQuotesOutput> {
    await this.ensureConfigured();
    return crapi.ramp.getQuotes(input);
  }

  /**
   * Get ramp quotes for a session.
   */
  async getRampSessionQuotes(input: GetRampSessionQuotesInput) {
    await this.ensureConfigured();
    return crapi.ramp.getQuotesForSession(input);
  }

  /**
   * Get all supported countries with currency details.
   */
  async getRampCountries(input?: GetRampCountriesInput) {
    await this.ensureConfigured();
    return crapi.ramp.getCountries(input);
  }

  /**
   * Get ramp countries for a session.
   */
  async getRampSessionCountries(input?: GetRampCountriesInput) {
    await this.ensureConfigured();
    return crapi.ramp.getCountriesForSession(input);
  }

  /**
   * Get a deduplicated list of supported fiat currencies.
   */
  async getRampCurrencies(input?: GetRampCurrenciesInput) {
    await this.ensureConfigured();
    return crapi.ramp.getCurrencies(input);
  }

  /**
   * Get ramp currencies for a session.
   */
  async getRampSessionCurrencies(input?: GetRampCurrenciesInput) {
    await this.ensureConfigured();
    return crapi.ramp.getCurrenciesForSession(input);
  }

  /**
   * Create a fiat-to-crypto order.
   * Returns a provider widget URL for the user to complete payment.
   */
  async createRampOrder(input: CreateRampOrderInput) {
    await this.ensureConfigured();
    return crapi.ramp.createOrder(input);
  }

  /**
   * Create a ramp order for a session.
   */
  async createRampSessionOrder(input: CreateRampSessionOrderInput) {
    await this.ensureConfigured();
    return crapi.ramp.createOrderForSession(input);
  }

  /**
   * Get a ramp order by ID.
   */
  async getRampOrder(id: string): Promise<PaymentRampOrder> {
    await this.ensureConfigured();
    return crapi.ramp.getOrder(id);
  }

  /**
   * Get a ramp order by ID for a session.
   */
  async getRampSessionOrder(id: string): Promise<PaymentRampOrder> {
    await this.ensureConfigured();
    return crapi.ramp.getOrderForSession(id);
  }

  /**
   * Get a ramp order by intent address.
   */
  async getRampOrderByIntent(intentAddress: string) {
    await this.ensureConfigured();
    return crapi.ramp.getOrderByIntent(intentAddress);
  }

  /**
   * List all ramp orders (newest first).
   */
  async listRampOrders(input?: ListRampOrdersInput) {
    await this.ensureConfigured();
    return crapi.ramp.listOrders(input);
  }

  /**
   * Confirm a ramp order after the user completes the deposit action.
   */
  async confirmRampOrder(id: string) {
    await this.ensureConfigured();
    return crapi.ramp.confirmOrder(id);
  }

  /**
   * Confirm a ramp order for a session.
   */
  async confirmRampSessionOrder(id: string) {
    await this.ensureConfigured();
    return crapi.ramp.confirmOrderForSession(id);
  }

  /**
   * Cancel a ramp order if it's still in a cancellable state.
   */
  async cancelRampOrder(id: string) {
    await this.ensureConfigured();
    return crapi.ramp.cancelOrder(id);
  }
}
