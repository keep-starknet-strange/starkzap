import {
  LayerswapApiError,
  type LayerswapApiConfig,
  type LayerswapCreateRequest,
  type LayerswapGetDestinationsRequest,
  type LayerswapGetNetworksRequest,
  type LayerswapGetSourcesRequest,
  type LayerswapGetSwapsRequest,
  type LayerswapGetTransactionStatusRequest,
  type LayerswapQuoteRequest,
  type LsApiResponse,
  type LsDepositAction,
  type LsDetailedQuote,
  type LsLimits,
  type LsNetwork,
  type LsQuote,
  type LsQuoteResponse,
  type LsRoute,
  type LsSwap,
  type LsSwapResponse,
  type LsTransactionStatus,
  type LayerswapTokenSource,
} from "@/bridge/ethereum/layerswap/types";
import { assertSafeHttpUrl } from "@/utils";

const DEFAULT_BASE_URL = "https://api.layerswap.io";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Low-level HTTP client for the Layerswap REST API v2.
 *
 * Zero dependencies — uses native `fetch` and `URLSearchParams`.
 * Works in Node 18+, Deno, Bun, browsers, and Cloudflare Workers.
 */
export class LayerswapApi implements LayerswapTokenSource {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;

  constructor(config: LayerswapApiConfig) {
    if (!config.apiKey) {
      throw new Error("Layerswap API key is required.");
    }
    this.apiKey = config.apiKey;
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.baseUrl = assertSafeHttpUrl(baseUrl, "bridging.layerswapBaseUrl")
      .toString()
      .replace(/\/+$/, "");
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  // ============================================================
  // Route discovery
  // ============================================================

  /** Get available source networks and tokens. */
  async getSources(params?: LayerswapGetSourcesRequest): Promise<LsRoute[]> {
    const qs = new URLSearchParams();
    if (params?.destinationNetwork)
      qs.set("destination_network", params.destinationNetwork);
    if (params?.destinationToken)
      qs.set("destination_token", params.destinationToken);
    if (params?.includeSwaps != null)
      qs.set("include_swaps", String(params.includeSwaps));
    if (params?.includeUnavailable != null)
      qs.set("include_unavailable", String(params.includeUnavailable));
    if (params?.includeUnmatched != null)
      qs.set("include_unmatched", String(params.includeUnmatched));
    if (params?.hasDepositAddress != null)
      qs.set("has_deposit_address", String(params.hasDepositAddress));
    if (params?.networkTypes?.length)
      qs.set("network_types", params.networkTypes.join(","));
    // A successful response with no routes returns `{ data: null }`; normalize
    // to an empty list so callers can rely on the array contract.
    return (await this.get<LsRoute[] | null>("/api/v2/sources", qs)) ?? [];
  }

  /** Get available destination networks and tokens. */
  async getDestinations(
    params?: LayerswapGetDestinationsRequest
  ): Promise<LsRoute[]> {
    const qs = new URLSearchParams();
    if (params?.sourceNetwork) qs.set("source_network", params.sourceNetwork);
    if (params?.sourceToken) qs.set("source_token", params.sourceToken);
    if (params?.includeSwaps != null)
      qs.set("include_swaps", String(params.includeSwaps));
    if (params?.includeUnavailable != null)
      qs.set("include_unavailable", String(params.includeUnavailable));
    if (params?.includeUnmatched != null)
      qs.set("include_unmatched", String(params.includeUnmatched));
    if (params?.networkTypes?.length)
      qs.set("network_types", params.networkTypes.join(","));
    // A successful response with no routes returns `{ data: null }`; normalize
    // to an empty list so callers can rely on the array contract.
    return (await this.get<LsRoute[] | null>("/api/v2/destinations", qs)) ?? [];
  }

  /** Get all available networks with their tokens. */
  async getNetworks(
    params?: LayerswapGetNetworksRequest
  ): Promise<LsNetwork[]> {
    const qs = new URLSearchParams();
    if (params?.networkTypes?.length)
      qs.set("network_types", params.networkTypes.join(","));
    // A successful response with no networks returns `{ data: null }`; normalize
    // to an empty list so callers can rely on the array contract.
    return (await this.get<LsNetwork[] | null>("/api/v2/networks", qs)) ?? [];
  }

  // ============================================================
  // Quote & limits
  // ============================================================

  /** Get min/max transfer limits for a route. */
  async getLimits(request: LayerswapQuoteRequest): Promise<LsLimits> {
    return this.get<LsLimits>("/api/v2/limits", this.quoteParams(request));
  }

  /** Get a swap quote with fee breakdown. */
  async getQuote(request: LayerswapQuoteRequest): Promise<LsQuote> {
    const response = await this.get<LsQuoteResponse>(
      "/api/v2/quote",
      this.quoteParams(request)
    );
    return response.quote;
  }

  /** Get detailed quote information with fee breakdown and routing paths. */
  async getDetailedQuote(
    request: LayerswapQuoteRequest
  ): Promise<LsDetailedQuote[]> {
    return this.get<LsDetailedQuote[]>(
      "/api/v2/detailed_quote",
      this.quoteParams(request)
    );
  }

  // ============================================================
  // Swap lifecycle
  // ============================================================

  /** Create a new swap. Returns the full response including swap, deposit actions, and quote. */
  async createSwap(request: LayerswapCreateRequest): Promise<LsSwapResponse> {
    return this.post<LsSwapResponse>("/api/v2/swaps", {
      source_network: request.sourceNetwork,
      source_token: request.sourceToken,
      destination_network: request.destinationNetwork,
      destination_token: request.destinationToken,
      amount: request.amount,
      destination_address: request.destinationAddress,
      ...(request.sourceAddress && { source_address: request.sourceAddress }),
      ...(request.refundAddress && { refund_address: request.refundAddress }),
      refuel: request.refuel ?? false,
      use_deposit_address: request.useDepositAddress ?? false,
      ...(request.useNewDepositAddress != null && {
        use_new_deposit_address: request.useNewDepositAddress,
      }),
      ...(request.slippage && { slippage: request.slippage }),
      ...(request.referenceId && { reference_id: request.referenceId }),
      ...(request.appName && { app_name: request.appName }),
      ...(request.sourceExchange && {
        source_exchange: request.sourceExchange,
      }),
      ...(request.destinationExchange && {
        destination_exchange: request.destinationExchange,
      }),
    });
  }

  /** List swaps for a given address. */
  async getSwaps(params: LayerswapGetSwapsRequest): Promise<LsSwap[]> {
    const qs = new URLSearchParams();
    qs.set("address", params.address);
    if (params.page != null) qs.set("page", String(params.page));
    if (params.includeExpired != null)
      qs.set("include_expired", String(params.includeExpired));
    return this.get<LsSwap[]>("/api/v2/swaps", qs);
  }

  /** Get a swap by ID. */
  async getSwap(swapId: string): Promise<LsSwapResponse> {
    return this.get<LsSwapResponse>(
      `/api/v2/swaps/${encodeURIComponent(swapId)}`
    );
  }

  /** Get a swap by transaction hash. */
  async getSwapByTransactionHash(
    transactionHash: string
  ): Promise<LsSwapResponse> {
    return this.get<LsSwapResponse>(
      `/api/v2/swaps/by_transaction_hash/${encodeURIComponent(transactionHash)}`
    );
  }

  /** Get deposit actions for a swap. */
  async getDepositActions(
    swapId: string,
    sourceAddress?: string
  ): Promise<LsDepositAction[]> {
    const qs = new URLSearchParams();
    if (sourceAddress) qs.set("source_address", sourceAddress);
    return this.get<LsDepositAction[]>(
      `/api/v2/swaps/${encodeURIComponent(swapId)}/deposit_actions`,
      qs
    );
  }

  /** Speed up deposit detection by providing the transaction hash. */
  async speedUpDeposit(swapId: string, transactionHash: string): Promise<void> {
    await this.post(
      `/api/v2/swaps/${encodeURIComponent(swapId)}/deposit_speedup`,
      { transaction_id: transactionHash }
    );
  }

  // ============================================================
  // Status
  // ============================================================

  /** Check API health. */
  async health(): Promise<void> {
    const url = `${this.baseUrl}/api/v2/health`;
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new LayerswapApiError(
        response.status,
        undefined,
        `Layerswap API health check failed (HTTP ${response.status})`
      );
    }
  }

  /** Get transaction status on a network. */
  async getTransactionStatus(
    params: LayerswapGetTransactionStatusRequest
  ): Promise<LsTransactionStatus> {
    const qs = new URLSearchParams();
    qs.set("network", params.network);
    qs.set("transaction_id", params.transactionId);
    return this.get<LsTransactionStatus>("/api/v2/transaction_status", qs);
  }

  // ============================================================
  // Internals
  // ============================================================

  private quoteParams(request: LayerswapQuoteRequest): URLSearchParams {
    const params = new URLSearchParams();
    params.set("source_network", request.sourceNetwork);
    params.set("source_token", request.sourceToken);
    params.set("destination_network", request.destinationNetwork);
    params.set("destination_token", request.destinationToken);
    params.set("amount", String(request.amount));
    if (request.refuel) params.set("refuel", "true");
    if (request.slippage) params.set("slippage", request.slippage);
    if (request.sourceAddress)
      params.set("source_address", request.sourceAddress);
    if (request.useDepositAddress != null)
      params.set("use_deposit_address", String(request.useDepositAddress));
    return params;
  }

  private async get<T>(path: string, params?: URLSearchParams): Promise<T> {
    const qs = params?.toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });
    return this.unwrap<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.unwrap<T>(response);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new LayerswapApiError(
          0,
          undefined,
          `Layerswap API request timed out after ${this.requestTimeoutMs}ms`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(): Record<string, string> {
    return { "X-LS-APIKEY": this.apiKey };
  }

  private async unwrap<T>(response: Response): Promise<T> {
    let json: LsApiResponse<T>;
    try {
      json = (await response.json()) as LsApiResponse<T>;
    } catch {
      // CDN/edge errors (e.g. 502 with HTML body) won't be JSON. Surface
      // them as a structured LayerswapApiError instead of a raw SyntaxError.
      throw new LayerswapApiError(
        response.status,
        undefined,
        `Layerswap API returned non-JSON response (HTTP ${response.status})`
      );
    }
    if (!response.ok || json.error) {
      throw new LayerswapApiError(
        response.status,
        json.error?.code,
        json.error?.message ?? `Layerswap API error (HTTP ${response.status})`,
        json.error?.metadata
      );
    }
    // Successful responses with no payload (e.g. `deposit_speedup`) return
    // `{ data: null, error: null }`. Treat null/undefined as the empty result
    // and let typed callers fail at use-site if the contract is broken.
    return json.data as T;
  }
}
