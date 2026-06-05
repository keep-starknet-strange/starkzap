import { assertSafeHttpUrl } from "@/utils";
import { fetchJsonWithTimeout } from "@/utils/http";
import type {
  PaycrestCurrency,
  PaycrestInstitution,
  PaycrestNetwork,
  PaycrestOrder,
  PaycrestOrderList,
  PaycrestProviderOrderStatus,
  PaycrestRate,
  PaycrestToken,
} from "@/paycrest/types";

export const PAYCREST_API_BASE_DEFAULT = "https://api.paycrest.io";
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thrown by {@link PaycrestApi} on a non-2xx HTTP response. `status` is the
 * raw HTTP code so callers can branch on it (e.g. treat 404 as transient
 * while an indexer catches up to a freshly-emitted on-chain event).
 */
export class PaycrestApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly method: string;
  readonly body: unknown;
  constructor(args: {
    status: number;
    method: string;
    path: string;
    message: string;
    body: unknown;
  }) {
    super(`Paycrest API ${args.method} ${args.path} failed: ${args.message}`);
    this.name = "PaycrestApiError";
    this.status = args.status;
    this.path = args.path;
    this.method = args.method;
    this.body = args.body;
  }
}

export interface PaycrestApiOptions {
  apiBaseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}

interface PaycrestEnvelope<T> {
  status: string;
  message?: string;
  data: T;
}

/**
 * Thin REST client for the Paycrest Sender API. Mirrors the HTTP pattern
 * used by `src/signer/privy.ts` — URL validation up front, AbortController
 * timeout, JSON-error extraction with multiple fallback keys.
 *
 * Unauthenticated endpoints (currencies, institutions, tokens, rates,
 * pubkey) work without an API key; order-creating endpoints require one.
 */
export class PaycrestApi {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: PaycrestApiOptions = {}) {
    const rawBase = options.apiBaseUrl ?? PAYCREST_API_BASE_DEFAULT;
    this.baseUrl = assertSafeHttpUrl(rawBase, "PaycrestOptions.apiBaseUrl")
      .toString()
      .replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetcher =
      options.fetch ??
      ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, init));
    this.timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** RSA public key (PEM) used to encrypt recipient details on the gateway path. */
  async getPublicKey(): Promise<string> {
    const env = await this.request<string>("/v2/pubkey", { method: "GET" });
    return env;
  }

  async getCurrencies(): Promise<PaycrestCurrency[]> {
    return this.request<PaycrestCurrency[]>("/v2/currencies", {
      method: "GET",
    });
  }

  async getInstitutions(currencyCode: string): Promise<PaycrestInstitution[]> {
    if (!currencyCode) {
      throw new Error("Paycrest.getInstitutions: currencyCode is required");
    }
    return this.request<PaycrestInstitution[]>(
      `/v2/institutions/${encodeURIComponent(currencyCode)}`,
      { method: "GET" }
    );
  }

  async getTokens(network?: PaycrestNetwork): Promise<PaycrestToken[]> {
    const path = network
      ? `/v2/tokens?network=${encodeURIComponent(network)}`
      : "/v2/tokens";
    return this.request<PaycrestToken[]>(path, { method: "GET" });
  }

  async getRate(args: {
    network: PaycrestNetwork;
    token: string;
    amount: string | number;
    fiat: string;
    side?: "buy" | "sell";
    providerId?: string;
  }): Promise<PaycrestRate> {
    const { network, token, amount, fiat, side, providerId } = args;
    const params = new URLSearchParams();
    if (side) params.set("side", side);
    if (providerId) params.set("provider_id", providerId);
    const query = params.toString();
    const path = `/v2/rates/${encodeURIComponent(network)}/${encodeURIComponent(token)}/${encodeURIComponent(String(amount))}/${encodeURIComponent(fiat)}${query ? `?${query}` : ""}`;
    return this.request<PaycrestRate>(path, { method: "GET" });
  }

  async createOrder(
    body: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<PaycrestOrder> {
    this.requireApiKey("createOrder");
    return this.request<PaycrestOrder>(
      "/v2/sender/orders",
      { method: "POST", body: JSON.stringify(body) },
      options?.signal
    );
  }

  async getOrder(
    id: string,
    options?: { signal?: AbortSignal }
  ): Promise<PaycrestOrder> {
    if (!id || id.trim() === "") {
      throw new Error("Paycrest.getOrder: id is required");
    }
    this.requireApiKey("getOrder");
    return this.request<PaycrestOrder>(
      `/v2/sender/orders/${encodeURIComponent(id)}`,
      { method: "GET" },
      options?.signal
    );
  }

  async listOrders(
    filter?: Record<string, string | number>,
    options?: { signal?: AbortSignal }
  ): Promise<PaycrestOrderList> {
    this.requireApiKey("listOrders");
    let path = "/v2/sender/orders";
    if (filter && Object.keys(filter).length > 0) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filter)) params.set(k, String(v));
      path += `?${params.toString()}`;
    }
    return this.request<PaycrestOrderList>(
      path,
      { method: "GET" },
      options?.signal
    );
  }

  /**
   * Look up an order by its on-chain gateway_id. Hits
   * `GET /v2/orders/{chain_id}/{gateway_id}` (the
   * `GetProviderOrderStatus` endpoint), which is the only public
   * endpoint that indexes by gateway_id.
   *
   * Public endpoint — no API key required. Returns a smaller status
   * shape than the full `PaycrestOrder`.
   *
   * `chainId` is the aggregator's fictional int64 for the network —
   * for Starknet mainnet it's `STARKNET_MAINNET_CHAIN_ID` from
   * `presets.ts`. Stored as `bigint` because the value exceeds
   * `Number.MAX_SAFE_INTEGER`.
   */
  async getProviderOrderStatus(
    chainId: bigint | number | string,
    gatewayId: string,
    options?: { signal?: AbortSignal }
  ): Promise<PaycrestProviderOrderStatus> {
    // The aggregator's int64 chainId for Starknet (23448594291968334)
    // exceeds Number.MAX_SAFE_INTEGER, so a `number` callers may pass
    // would silently round. Reject unsafe numeric inputs up front so
    // mistakes surface as a clear argument error instead of a request
    // for the wrong order id.
    if (typeof chainId === "number" && !Number.isSafeInteger(chainId)) {
      throw new Error(
        "Paycrest.getProviderOrderStatus: chainId must be a safe integer, bigint, or decimal string (received unsafe number)."
      );
    }
    if (typeof chainId === "string" && chainId.trim() === "") {
      throw new Error("Paycrest.getProviderOrderStatus: chainId is required");
    }
    if (!gatewayId || gatewayId.trim() === "") {
      throw new Error("Paycrest.getProviderOrderStatus: gatewayId is required");
    }
    return this.request<PaycrestProviderOrderStatus>(
      `/v2/orders/${encodeURIComponent(String(chainId))}/${encodeURIComponent(gatewayId)}`,
      { method: "GET" },
      options?.signal
    );
  }

  private requireApiKey(method: string): void {
    if (!this.apiKey || this.apiKey.trim() === "") {
      throw new Error(
        `Paycrest.${method} requires an API key — pass apiKey to the Paycrest constructor or via SDKConfig.paycrest.apiKey.`
      );
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    callerSignal?: AbortSignal
  ): Promise<T> {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.apiKey) headers["API-Key"] = this.apiKey;
    if (init.headers)
      Object.assign(headers, init.headers as Record<string, string>);

    // The timeout + caller-abort plumbing is shared with the Privy signer
    // via `fetchJsonWithTimeout`; the Paycrest-specific envelope unwrapping
    // and error extraction stay in the `parse` callback below.
    return fetchJsonWithTimeout<T>(
      `${this.baseUrl}${path}`,
      { ...init, headers },
      {
        fetchImpl: this.fetcher,
        timeoutMs: this.timeoutMs,
        ...(callerSignal ? { callerSignal } : {}),
        onTimeout: () =>
          new Error(
            `Paycrest API ${method} ${path} timed out after ${this.timeoutMs}ms`
          ),
        onCallerAbort: () =>
          new Error(`Paycrest API ${method} ${path} aborted by caller signal`),
      },
      async (res) => {
        let parsed: unknown;
        try {
          parsed = await res.json();
        } catch {
          if (!res.ok) {
            throw new PaycrestApiError({
              status: res.status,
              method,
              path,
              message: `${res.status} ${res.statusText}`,
              body: undefined,
            });
          }
          throw new Error(
            `Paycrest API returned non-JSON response for ${path}`
          );
        }

        if (!res.ok) {
          const message =
            extractErrorMessage(parsed) ?? `${res.status} ${res.statusText}`;
          throw new PaycrestApiError({
            status: res.status,
            method,
            path,
            message,
            body: parsed,
          });
        }

        const envelope = parsed as Partial<PaycrestEnvelope<T>>;
        if (envelope && "data" in envelope) {
          return envelope.data as T;
        }
        // Some endpoints (e.g. raw key) may return a value directly.
        return parsed as T;
      }
    );
  }
}

function extractErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  for (const key of ["message", "error", "details"]) {
    const entry = v[key];
    if (typeof entry === "string" && entry.length > 0) return entry;
  }
  if (typeof v["data"] === "object" && v["data"] !== null) {
    return extractErrorMessage(v["data"]);
  }
  return null;
}
