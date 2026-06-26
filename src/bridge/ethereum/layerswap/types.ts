/** Network type as reported by the Layerswap API. */
export type LsNetworkType =
  | "evm"
  | "starknet"
  | "solana"
  | "cosmos"
  | "starkex"
  | "zksynclite"
  | "ton"
  | "paradex"
  | "tron"
  | "bitcoin"
  | (string & {});

/** Token descriptor from the Layerswap API. */
export interface LsToken {
  readonly symbol: string;
  readonly display_asset?: string;
  readonly logo: string;
  readonly contract: string | null;
  readonly decimals: number;
  readonly price_in_usd: number;
  readonly precision: number;
  readonly listing_date: string;
  readonly group?: string;
}

/** Network descriptor from the Layerswap API. */
export interface LsNetwork {
  readonly name: string;
  readonly display_name: string;
  readonly logo: string;
  readonly chain_id: string | null;
  readonly type: LsNetworkType;
  readonly transaction_explorer_template: string;
  readonly account_explorer_template: string;
  readonly node_url?: string | null;
  readonly deposit_methods?: readonly string[];
  readonly tokens?: readonly LsToken[];
  readonly token?: LsToken;
  readonly metadata?: {
    readonly listing_date: string;
    readonly evm_oracle_contract?: string | null;
    readonly evm_multicall_contract?: string | null;
  };
}

/** Route entry: a network with its available tokens (returned by /sources, /destinations). */
export type LsRoute = LsNetwork & {
  readonly tokens: readonly LsToken[];
};

/** Min/max transfer limits for a route. */
export interface LsLimits {
  readonly min_amount: number;
  readonly max_amount: number;
  readonly min_amount_in_usd?: number;
  readonly max_amount_in_usd?: number;
}

/** Swap quote with fee breakdown. */
export interface LsQuote {
  readonly source_network: LsNetwork;
  readonly source_token: LsToken;
  readonly destination_network: LsNetwork;
  readonly destination_token: LsToken;
  readonly receive_amount: number;
  readonly min_receive_amount: number;
  readonly total_fee: number;
  readonly total_fee_in_usd: number;
  readonly blockchain_fee: number;
  readonly service_fee: number;
  readonly avg_completion_time: string;
  readonly slippage?: number;
  readonly refuel_in_source?: number | null;
  readonly rate?: number;
  readonly fee_discount?: number;
}

/** Token amount with USD value, used for refuel/reward fields. */
export interface LsTokenWithAmount {
  readonly token?: LsToken;
  readonly amount?: number;
  readonly amount_in_usd?: number;
  readonly network?: LsNetwork;
}

/** Wrapper returned by GET /api/v2/quote. */
export interface LsQuoteResponse {
  readonly quote: LsQuote;
  readonly refuel: LsTokenWithAmount | null;
  readonly reward: LsTokenWithAmount | null;
}

/** Swap lifecycle status values. */
export type LsSwapStatus =
  | "created"
  | "user_transfer_pending"
  | "user_transfer_delayed"
  | "ls_transfer_pending"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled"
  | "pending_refund"
  | "refunded";

/** On-chain transaction associated with a swap. */
export interface LsTransaction {
  readonly type: "input" | "output" | "refuel" | "refund";
  readonly from: string | null;
  readonly to: string | null;
  readonly created_date: string;
  readonly amount: number;
  readonly transaction_hash: string | null;
  readonly confirmations: number;
  readonly max_confirmations: number;
  readonly usd_value: number;
  readonly usd_price: number;
  readonly status: "completed" | "failed" | "initiated" | "pending";
  readonly network?: LsNetwork;
  readonly token?: LsToken;
  readonly fee_token?: LsToken;
  readonly fee_amount?: number | null;
}

/** Deposit action the user must execute to complete a swap. */
export interface LsDepositAction {
  readonly type: "transfer" | "manual_transfer";
  readonly to_address?: string;
  readonly amount: number;
  readonly amount_in_base_units: string;
  readonly order: number;
  readonly network: LsNetwork;
  readonly token: LsToken;
  readonly fee_token?: LsToken;
  readonly call_data: string | null;
  readonly gas_limit?: string;
}

/** Exchange info associated with a swap. */
export interface LsExchange {
  readonly name: string;
  readonly display_name?: string;
  readonly logo?: string;
  readonly metadata?: {
    readonly o_auth?: Record<string, unknown>;
  };
}

/** Swap object as returned by the API. */
export interface LsSwap {
  readonly id: string;
  readonly created_date: string;
  readonly status: LsSwapStatus;
  readonly source_network: LsNetwork;
  readonly source_token: LsToken;
  readonly destination_network: LsNetwork;
  readonly destination_token: LsToken;
  readonly destination_address: string;
  readonly requested_amount: number;
  readonly fail_reason: string | null;
  readonly use_deposit_address: boolean;
  readonly source_exchange?: LsExchange | null;
  readonly destination_exchange?: LsExchange | null;
  readonly metadata: {
    readonly reference_id?: string | null;
    readonly app?: string | null;
    readonly exchange_account?: string | null;
    readonly sequence_number: number;
  };
  readonly transactions: readonly LsTransaction[];
}

/** Wrapper returned by POST /api/v2/swaps and GET /api/v2/swaps/{swapId}. */
export interface LsSwapResponse {
  readonly swap: LsSwap;
  readonly deposit_actions: readonly LsDepositAction[];
  readonly quote: LsQuote;
  readonly refuel: LsTokenWithAmount | null;
  readonly reward: LsTokenWithAmount | null;
}

/** Detailed quote entry returned by GET /api/v2/detailed_quote. */
export interface LsDetailedQuote {
  readonly avg_completion_milliseconds: number;
  readonly min_amount: number;
  readonly max_amount: number;
  readonly min_amount_in_usd?: number;
  readonly max_amount_in_usd?: number;
  readonly fee_amount_for_min?: number;
  readonly fee_amount_for_max?: number;
  readonly total_percentage_fee?: number;
  readonly total_fixed_fee_in_usd?: number;
  readonly total_fixed_fee_in_source?: number;
  readonly path?: readonly {
    readonly source_network: LsNetwork;
    readonly source_token: LsToken;
    readonly destination_network: LsNetwork;
    readonly destination_token: LsToken;
    readonly receive_amount?: number;
    readonly fee_amount?: number;
    readonly provider?: string;
  }[];
}

/** Transaction status response from GET /api/v2/transaction_status. */
export interface LsTransactionStatus {
  readonly network: string;
  readonly transaction_id: string;
  readonly is_found: boolean;
  readonly is_completed: boolean;
  readonly confirmations?: number;
  readonly max_confirmations?: number;
}

/** Wrapper for all Layerswap API responses. */
export interface LsApiResponse<T> {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  } | null;
  readonly data: T | null;
}

/** Parameters for querying a swap quote or route limits. */
export interface LayerswapQuoteRequest {
  readonly sourceNetwork: string;
  readonly sourceToken: string;
  readonly destinationNetwork: string;
  readonly destinationToken: string;
  readonly amount: string | number;
  readonly refuel?: boolean;
  readonly slippage?: string;
  readonly sourceAddress?: string;
  readonly useDepositAddress?: boolean;
}

/** Parameters for creating a new swap. */
export interface LayerswapCreateRequest {
  readonly sourceNetwork: string;
  readonly sourceToken: string;
  readonly destinationNetwork: string;
  readonly destinationToken: string;
  readonly amount: string | number;
  readonly destinationAddress: string;
  readonly sourceAddress?: string;
  readonly refundAddress?: string;
  readonly refuel?: boolean;
  readonly slippage?: string;
  readonly referenceId?: string;
  readonly appName?: string;
  readonly useDepositAddress?: boolean;
  readonly useNewDepositAddress?: boolean;
  readonly sourceExchange?: string;
  readonly destinationExchange?: string;
}

/** Parameters for listing swaps by address. */
export interface LayerswapGetSwapsRequest {
  readonly address: string;
  readonly page?: number;
  readonly includeExpired?: boolean;
}

/** Parameters for GET /api/v2/sources. */
export interface LayerswapGetSourcesRequest {
  readonly destinationNetwork?: string;
  readonly destinationToken?: string;
  readonly includeSwaps?: boolean;
  readonly includeUnavailable?: boolean;
  readonly includeUnmatched?: boolean;
  readonly hasDepositAddress?: boolean;
  readonly networkTypes?: string[];
}

/** Parameters for GET /api/v2/destinations. */
export interface LayerswapGetDestinationsRequest {
  readonly sourceNetwork?: string;
  readonly sourceToken?: string;
  readonly includeSwaps?: boolean;
  readonly includeUnavailable?: boolean;
  readonly includeUnmatched?: boolean;
  readonly networkTypes?: string[];
}

/** Parameters for GET /api/v2/networks. */
export interface LayerswapGetNetworksRequest {
  readonly networkTypes?: string[];
}

/**
 * Narrow view of the Layerswap API covering only the route-discovery calls
 * used to enumerate bridgeable tokens. Lets consumers (e.g. the bridge token
 * repository) depend on — and tests stub — just the surface they need.
 */
export interface LayerswapTokenSource {
  getSources(params?: LayerswapGetSourcesRequest): Promise<LsRoute[]>;
  getDestinations(params?: LayerswapGetDestinationsRequest): Promise<LsRoute[]>;
}

/** Parameters for GET /api/v2/transaction_status. */
export interface LayerswapGetTransactionStatusRequest {
  readonly network: string;
  readonly transactionId: string;
}

export interface LayerswapApiConfig {
  /**
   * API key sent as `X-LS-APIKEY` on every request. Required — keys are
   * environment-scoped (separate mainnet/testnet keys), so unauthenticated
   * requests could resolve routes for the wrong environment.
   */
  apiKey: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
}

/** Error thrown when the Layerswap API returns an error response. */
export class LayerswapApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string | undefined;
  readonly metadata: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    errorCode: string | undefined,
    message: string,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.metadata = metadata;
    this.name = "LayerswapApiError";
  }
}
