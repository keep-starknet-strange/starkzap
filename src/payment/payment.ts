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
 * const quotes = await payment.getAllQuotes({
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

import { Chainrails, crapi } from "@chainrails/sdk";
import type {
  PaymentConfig,
  // Quotes
  GetQuoteFromBridgeInput,
  GetQuoteFromBridgeOutput,
  GetQuotesFromAllBridgesInput,
  GetQuotesFromAllBridgesOutput,
  GetBestQuoteInput,
  GetBestQuoteOutput,
  GetAllQuotesInput,
  GetAllQuotesOutput,
  GetSessionQuotesInput,
  GetSessionQuotesOutput,
  // Intents
  PaymentIntent,
  CreatePaymentIntentInput,
  CreateSessionIntentInput,
  ListPaymentIntentsInput,
  ListPaymentIntentsOutput,
  PaymentIntentStatus,
  TriggerProcessingOutput,
  // Router
  GetOptimalRouteInput,
  GetOptimalRouteOutput,
  GetSupportedBridgesInput,
  GetSupportedBridgesOutput,
  GetAllSupportedBridgesOutput,
  PaymentBridge,
  // Chains
  GetSupportedChainsInput,
  GetChainBalanceInput,
  PaymentModalHandle,
  PaymentModalInput,
  // Auth
  CreatePaymentSessionInput,
  PaymentSessionOutput,
  // Client
  PaymentClientInfo,
} from "@/payment/types";

/**
 * Cross-chain payment module powered by Chainrails.
 *
 * Accept payments from any chain, any token (EVM + Starknet), with automatic
 * bridge routing, fee quoting, and intent-based settlement.
 */
export class Payment {
  private modalManagerPromise: Promise<{
    modal: (input: PaymentModalInput) => PaymentModalHandle;
  }> | null = null;

  constructor(config: PaymentConfig) {
    void Chainrails.config({
      api_key: config.apiKey,
      env: config.environment ?? "production",
    });
  }

  private getModalManager(): Promise<{
    modal: (input: PaymentModalInput) => PaymentModalHandle;
  }> {
    if (!this.modalManagerPromise) {
      this.modalManagerPromise = import("@/payment/modal").then(
        ({ PaymentModalManager }) => new PaymentModalManager()
      );
    }

    return this.modalManagerPromise;
  }

  // ══════════════════════════════════════════════
  // Sessions / Auth
  // ══════════════════════════════════════════════

  /**
   * Create a payment session for a recipient.
   *
   * Sessions bind a recipient + token + amount so that payers
   * only need to choose a source chain & token.
   *
   * @returns Session token + amount (to be used in subsequent session calls).
   *
   * @example
   * ```ts
   * const session = await payment.createSession({
   *   recipient: "0xRecipient...",
   *   token: "USDC",
   *   destinationChain: "STARKNET",
   *   amount: "25.00",
   * });
   * // Use session.sessionToken for session-scoped calls
   * ```
   */
  async createSession(
    input: CreatePaymentSessionInput
  ): Promise<PaymentSessionOutput> {
    const result = await crapi.auth.getSessionToken(input);
    return result;
  }

  /**
   * Create a platform-aware payment modal handle.
   *
   * Call `.pay()` on the returned object to open the modal and resolve with:
   * - `true` on successful payment
   * - `false` on cancel/close
   */
  modal(input: PaymentModalInput): PaymentModalHandle {
    const platform = input.platform ?? "web";

    const handle: PaymentModalHandle = {
      platform,
      sessionToken: input.sessionToken,
      pay: async () => {
        const modalManager = await this.getModalManager();
        return modalManager.modal({ ...input, platform }).pay();
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
  async getQuoteFromBridge(
    input: GetQuoteFromBridgeInput
  ): Promise<GetQuoteFromBridgeOutput> {
    return crapi.quotes.getFromSpecificBridge(input);
  }

  /**
   * Get quotes from all available bridges for a route.
   */
  async getQuotesFromAllBridges(
    input: GetQuotesFromAllBridgesInput
  ): Promise<GetQuotesFromAllBridgesOutput> {
    return crapi.quotes.getFromAllBridges({
      ...input,
      excludeBridges: input.excludeBridges ?? "",
    } as Parameters<typeof crapi.quotes.getFromAllBridges>[0]);
  }

  /**
   * Get the single best quote across all bridges for a route.
   */
  async getBestQuote(input: GetBestQuoteInput): Promise<GetBestQuoteOutput> {
    return crapi.quotes.getBestAcrossBridges(input);
  }

  /**
   * Get quotes from all possible source chains for a destination.
   *
   * This is the easiest way to discover every path a payer can use.
   */
  async getAllQuotes(input: GetAllQuotesInput): Promise<GetAllQuotesOutput> {
    return crapi.quotes.getAll(input);
  }

  /**
   * Get quotes for the current session (requires prior `createSession` call).
   */
  async getSessionQuotes(
    input: GetSessionQuotesInput
  ): Promise<GetSessionQuotesOutput> {
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
    return crapi.intents.create(input);
  }

  /**
   * Create a session-based payment intent.
   */
  async createSessionIntent(
    input: CreateSessionIntentInput
  ): Promise<PaymentIntent> {
    return crapi.intents.createForSession(input);
  }

  /**
   * Get a payment intent by its ID.
   */
  async getIntent(id: string): Promise<PaymentIntent> {
    return crapi.intents.getById(id);
  }

  /**
   * Get a payment intent by its on-chain address.
   */
  async getIntentByAddress(address: `0x${string}`): Promise<PaymentIntent> {
    return crapi.intents.getForAddress(address);
  }

  /**
   * Get all intents for a sender address.
   */
  async getIntentsForSender(sender: `0x${string}`): Promise<PaymentIntent[]> {
    return crapi.intents.getForSender(sender);
  }

  /**
   * List all intents with pagination and optional status filter.
   */
  async listIntents(
    input?: ListPaymentIntentsInput
  ): Promise<ListPaymentIntentsOutput> {
    return crapi.intents.getAll(input ?? {});
  }

  /**
   * Get all intents for the current session.
   */
  async getSessionIntents(address: `0x${string}`): Promise<PaymentIntent[]> {
    return crapi.intents.getForSession(address);
  }

  /**
   * Update the status of a payment intent.
   */
  async updateIntentStatus(
    id: string,
    status: PaymentIntentStatus
  ): Promise<PaymentIntent> {
    return crapi.intents.update(id, { status });
  }

  /**
   * Trigger processing (relay / settlement) of a funded intent.
   */
  async triggerProcessing(
    intentAddress: `0x${string}`
  ): Promise<TriggerProcessingOutput> {
    return crapi.intents.triggerProcessing(intentAddress);
  }

  /**
   * Trigger processing for a session-based intent.
   */
  async triggerSessionProcessing(
    intentAddress: `0x${string}`
  ): Promise<TriggerProcessingOutput> {
    return crapi.intents.triggerProcessingForSession(intentAddress);
  }

  // ══════════════════════════════════════════════
  // Router
  // ══════════════════════════════════════════════

  /**
   * Find the optimal cross-chain route (bridge + fees).
   */
  async getOptimalRoute(
    input: GetOptimalRouteInput
  ): Promise<GetOptimalRouteOutput> {
    return crapi.router.getOptimalRoutes(input);
  }

  /**
   * Get all bridge protocols supported by Chainrails.
   */
  async getAllSupportedBridges(): Promise<GetAllSupportedBridgesOutput> {
    return crapi.router.getAllSupportedBridges();
  }

  /**
   * Get bridges available for a specific source → destination route.
   */
  async getSupportedBridges(
    input: GetSupportedBridgesInput
  ): Promise<GetSupportedBridgesOutput> {
    return crapi.router.getSupportedBridges(input);
  }

  /**
   * Get all routes supported by a specific bridge.
   */
  async getSupportedRoutes(
    bridge: PaymentBridge
  ): Promise<GetOptimalRouteInput[]> {
    return crapi.router.getSupportedRoutes(bridge);
  }

  // ══════════════════════════════════════════════
  // Chains
  // ══════════════════════════════════════════════

  /**
   * Get chains supported for payments.
   */
  async getSupportedChains(input?: GetSupportedChainsInput): Promise<string[]> {
    return crapi.chains.getSupported(input);
  }

  /**
   * Get token balances for an address across chains.
   */
  async getBalance(input: GetChainBalanceInput): Promise<string> {
    return crapi.chains.getBalance(input);
  }

  // ══════════════════════════════════════════════
  // Client / Merchant Info
  // ══════════════════════════════════════════════

  /**
   * Get merchant/client account information.
   */
  async getClientInfo(): Promise<PaymentClientInfo> {
    return crapi.client.getClientInfo();
  }

  /**
   * Get client info for the current session.
   */
  async getSessionClientInfo(): Promise<PaymentClientInfo> {
    return crapi.client.getClientInfoForSession();
  }
}
