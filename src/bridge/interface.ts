import type { Call } from "starknet";
import type { Address, Amount, ChainId, Token } from "@/types";

/**
 * Bridge quote output shape.
 */
export type BridgeQuote = {
  /** Source chain id */
  sourceChainId: ChainId;
  /** Destination chain id */
  destChainId: ChainId;
  /** Token being bridged */
  token: Token;
  /** Amount being bridged in base units */
  amountBase: bigint;
  /** Estimated destination amount in base units */
  destAmountBase: bigint;
  /** Estimated bridge fee in source token base units */
  feeBase: bigint;
  /** Estimated destination gas (in destination chain native token) */
  destGasEstimate?: bigint;
  /** Estimated time in seconds */
  estimatedTimeSeconds?: number;
  /** Bridge provider identifier */
  provider?: string;
};

/**
 * Bridge request shape.
 */
export type BridgeRequest = {
  /** Source chain */
  sourceChainId: ChainId;
  /** Destination chain */
  destChainId: ChainId;
  /** Token to bridge */
  token: Token;
  /** Amount to bridge */
  amount: Amount;
  /** Recipient address on destination chain */
  recipient: Address;
  /** Optional slippage tolerance in basis points */
  slippageBps?: bigint;
};

/**
 * User-facing bridge input.
 */
export type BridgeInput = Omit<BridgeRequest, "sourceChainId" | "recipient"> & {
  sourceChainId?: ChainId;
  recipient?: Address;
  /** Optional bridge provider */
  provider?: BridgeProvider | string;
};

/**
 * Prepared bridge transaction ready for execution.
 */
export type PreparedBridge = {
  /** Bridge calls ready to execute */
  calls: Call[];
  /** Quote metadata */
  quote: BridgeQuote;
};

/**
 * Bridge provider contract for multi-protocol bridge integrations.
 */
export type BridgeProvider = {
  /** Stable provider identifier (e.g. "starkgate", "orbiter") */
  readonly id: string;
  /** List of supported source chains */
  readonly supportedSourceChains: ChainId[];
  /** List of supported destination chains */
  readonly supportedDestChains: ChainId[];
  /** Check if provider supports a given chain pair */
  supportsChainPair(sourceChainId: ChainId, destChainId: ChainId): boolean;
  /** Fetch a bridge quote */
  getQuote(request: BridgeRequest): Promise<BridgeQuote>;
  /** Build prepared bridge calls */
  bridge(request: BridgeRequest): Promise<PreparedBridge>;
};

/**
 * Supported bridge protocols.
 */
export type BridgeProtocol = "starkgate" | "orbiter" | "layerzero" | "any";
