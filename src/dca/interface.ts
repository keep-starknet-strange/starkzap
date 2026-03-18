import type { Call, RpcProvider } from "starknet";
import type {
  Address,
  AddressInput,
  Amount,
  ChainId,
  ExecuteOptions,
  Token,
} from "@/types";
import type { SwapProvider, SwapProviderResolver, SwapQuote } from "@/swap";
import type { Tx } from "@/tx";

export type DcaOrderStatus = "INDEXING" | "ACTIVE" | "CLOSED";
export type DcaTradeStatus = "CANCELLED" | "PENDING" | "SUCCEEDED";
export type DcaAction = "create" | "cancel";
export const DCA_CONTINUOUS_FREQUENCY = "CONTINUOUS" as const;
/**
 * ISO 8601 duration string (e.g. `"PT12H"`, `"P1D"`, `"P1W"`).
 * Providers may also return {@link DCA_CONTINUOUS_FREQUENCY} for continuous
 * TWAMM-style orders that do not execute on a discrete cycle.
 */
export type DcaFrequency = string;

export interface DcaPricingStrategyInput {
  minBuyAmount?: Amount;
  maxBuyAmount?: Amount;
}

export interface DcaPricingStrategy {
  minBuyAmountBase?: bigint;
  maxBuyAmountBase?: bigint;
}

export interface DcaTrade {
  sellAmountBase: bigint;
  sellAmountInUsd?: number;
  buyAmountBase?: bigint;
  buyAmountInUsd?: number;
  expectedTradeDate: Date;
  actualTradeDate?: Date;
  status: DcaTradeStatus;
  txHash?: string;
  errorReason?: string;
}

export interface DcaOrder {
  id: string;
  providerId: string;
  blockNumber?: number;
  timestamp: Date;
  traderAddress: Address;
  orderAddress: Address;
  creationTransactionHash?: string;
  orderClassHash?: string;
  sellTokenAddress: Address;
  sellAmountBase: bigint;
  sellAmountPerCycleBase?: bigint;
  buyTokenAddress: Address;
  startDate: Date;
  endDate: Date;
  closeDate?: Date;
  frequency: DcaFrequency;
  iterations: number;
  status: DcaOrderStatus;
  pricingStrategy: DcaPricingStrategy;
  amountSoldBase: bigint;
  amountBoughtBase: bigint;
  averageAmountBoughtBase: bigint;
  executedTradesCount: number;
  cancelledTradesCount: number;
  pendingTradesCount: number;
  trades: DcaTrade[];
}

export interface DcaOrdersPage {
  content: DcaOrder[];
  totalPages: number;
  totalElements: number;
  size: number;
  pageNumber: number;
}

export interface PreparedDcaAction {
  providerId: string;
  action: DcaAction;
  calls: Call[];
  orderId?: string;
  orderAddress?: Address;
}

export interface DcaCreateRequest {
  sellToken: Token;
  buyToken: Token;
  sellAmount: Amount;
  sellAmountPerCycle: Amount;
  frequency: DcaFrequency;
  traderAddress: Address;
  pricingStrategy?: DcaPricingStrategyInput;
}

export interface DcaCreateInput extends Omit<
  DcaCreateRequest,
  "traderAddress"
> {
  provider?: DcaProvider | string;
  traderAddress?: AddressInput;
}

export interface DcaCancelRequest {
  orderId?: string;
  orderAddress?: Address;
}

export interface DcaCancelInput {
  provider?: DcaProvider | string;
  orderId?: string;
  orderAddress?: AddressInput;
}

export interface DcaOrdersRequest {
  traderAddress: Address;
  status?: DcaOrderStatus;
  page?: number;
  size?: number;
  sort?: string;
}

export interface DcaOrdersInput extends Omit<
  DcaOrdersRequest,
  "traderAddress"
> {
  provider?: DcaProvider | string;
  traderAddress?: AddressInput;
}

export interface DcaCyclePreviewRequest {
  sellToken: Token;
  buyToken: Token;
  sellAmountPerCycle: Amount;
  swapProvider?: SwapProvider | string;
  chainId?: ChainId;
  traderAddress?: AddressInput;
  slippageBps?: bigint;
}

/**
 * Advanced provider runtime context.
 *
 * App code should usually call `wallet.dca()` helpers instead of constructing
 * provider contexts directly.
 */
export interface DcaProviderContext {
  chainId: ChainId;
  rpcProvider: RpcProvider;
  walletAddress: Address;
}

export interface DcaProviderResolver {
  getDefaultDcaProvider(): DcaProvider;
  getDcaProvider(providerId: string): DcaProvider;
}

export interface DcaExecutionContext extends SwapProviderResolver {
  readonly address: Address;
  getChainId(): ChainId;
  getProvider(): RpcProvider;
  execute(calls: Call[], options?: ExecuteOptions): Promise<Tx>;
}

/**
 * Advanced extension point for protocol-specific DCA adapters.
 *
 * Most apps should use the wallet-facing `DcaClientInterface` instead of
 * calling providers directly.
 */
export interface DcaProvider {
  readonly id: string;
  supportsChain(chainId: ChainId): boolean;
  getOrders(
    context: DcaProviderContext,
    request: DcaOrdersRequest
  ): Promise<DcaOrdersPage>;
  prepareCreate(
    context: DcaProviderContext,
    request: DcaCreateRequest
  ): Promise<PreparedDcaAction>;
  prepareCancel(
    context: DcaProviderContext,
    request: DcaCancelRequest
  ): Promise<PreparedDcaAction>;
}

export interface DcaClientInterface extends DcaProviderResolver {
  registerProvider(provider: DcaProvider, makeDefault?: boolean): void;
  setDefaultProvider(providerId: string): void;
  listProviders(): string[];
  getOrders(request?: DcaOrdersInput): Promise<DcaOrdersPage>;
  /** Advanced API for batching or custom execution flows. */
  prepareCreate(request: DcaCreateInput): Promise<PreparedDcaAction>;
  create(request: DcaCreateInput, options?: ExecuteOptions): Promise<Tx>;
  /** Advanced API for batching or custom execution flows. */
  prepareCancel(request: DcaCancelInput): Promise<PreparedDcaAction>;
  cancel(request: DcaCancelInput, options?: ExecuteOptions): Promise<Tx>;
  previewCycle(request: DcaCyclePreviewRequest): Promise<SwapQuote>;
}
