import type { Call } from "starknet";
import type { Address, Amount, ChainId, Token } from "@/types";

/**
 * Common quote output shape for swap providers.
 */
export type SwapQuote = {
  /** Quoted input amount in token-in base units */
  amountInBase: bigint;
  /** Quoted output amount in token-out base units */
  amountOutBase: bigint;
  /** Optional number of Starknet calls required to execute the route */
  routeCallCount?: number;
  /** Optional price impact in basis points */
  priceImpactBps?: bigint | null;
  /** Optional protocol/source identifier that produced the quote */
  provider?: string;
};

/**
 * Common swap request shape used by all providers.
 */
export type SwapRequest = {
  /** Target chain */
  chainId: ChainId;
  /** Optional taker/executor wallet address for provider-specific routing */
  takerAddress?: Address;
  /** Token being sold */
  tokenIn: Token;
  /** Token being bought */
  tokenOut: Token;
  /** Amount being sold */
  amountIn: Amount;
  /** Optional slippage tolerance in basis points */
  slippageBps?: bigint;
};

/**
 * User-facing swap input accepted by wallet helpers.
 *
 * Wallet methods auto-fill:
 * - `chainId` from the connected wallet chain
 * - `takerAddress` from the connected wallet address
 */
export type SwapInput = Omit<SwapRequest, "chainId" | "takerAddress"> & {
  chainId?: ChainId;
  takerAddress?: Address;
  /** Optional source provider or provider id; wallet default is used when omitted. */
  provider?: SwapProvider | string;
};

/**
 * Prepared provider swap payload ready for wallet execution.
 */
export type PreparedSwap = {
  /** Swap calls ready to execute */
  calls: Call[];
  /** Quote/route metadata */
  quote: SwapQuote;
};

/**
 * High-level provider contract for multi-protocol swap integrations.
 *
 * Implement this interface for each protocol (Ekubo, AVNU, etc.).
 */
export type SwapProvider = {
  /** Stable provider identifier (e.g. `"ekubo"`) */
  readonly id: string;
  /** Chain support guard */
  supportsChain(chainId: ChainId): boolean;
  /** Fetch a provider quote for the request */
  getQuote(request: SwapRequest): Promise<SwapQuote>;
  /** Build a prepared swap (calls + quote) from protocol-specific routing logic */
  swap(request: SwapRequest): Promise<PreparedSwap>;
};
