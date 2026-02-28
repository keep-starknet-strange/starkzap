import { ChainId } from "@/types";
import { CallData, type Call } from "starknet";
import type {
  BridgeProvider,
  BridgeQuote,
  BridgeRequest,
  PreparedBridge,
} from "@/bridge/interface";

/**
 * Layerswap bridge configuration and API.
 *
 * Layerswap supports 70+ networks including major L2s and CEX integrations.
 * API Docs: https://docs.layerswap.io/integration/API
 */
const LAYERSWAP_API = {
  BASE_URL: "https://api.layerswap.io",
  ROUTES_ENDPOINT: "/routes",
  SWAPS_ENDPOINT: "/swaps",
  API_VERSION: "v3",
};

/**
 * Layerswap supported destination chains (Starknet).
 */
const LAYERSWAP_CHAINS = {
  STARKNET_MAINNET: "STARKNET_MAINNET",
  STARKNET_SEPOLIA: "STARKNET_SEPOLIA",
} as const;

/**
 * Layerswap supported tokens on Starknet.
 */
const LAYERSWAP_TOKENS = {
  STARKNET_MAINNET: ["ETH", "STRK"],
  STARKNET_SEPOLIA: ["ETH"],
} as const;

/**
 * Destination token info from Layerswap.
 */

/**
 * Quote response from Layerswap API.
 */
interface LayerswapQuoteResponse {
  route_id: string;
  from_token: string;
  to_token: string;
  from_amount: string;
  to_amount: string;
  from_chain_id: string;
  to_chain_id: string;
  estimated_purchase_time: number;
  estimated_arrival_time: number;
  service_time: number;
  deposit_address: string;
  exchange: string | null;
  steps: Array<{
    id: string;
    type: string;
    from_token: string;
    to_token: string;
    from_amount: string;
    to_amount: string;
  }>;
}

/**
 * Layerswap API response types.
 */
interface LayerswapRoutesResponse {
  data: Array<{
    from_token: { symbol: string; contract_address: string };
    to_token: { symbol: string; contract_address: string };
    from_chain: { id: string; name: string };
    to_chain: { id: string; name: string };
    max_to_amount: string;
    min_from_amount: string;
    max_from_amount: string;
  }>;
}

export class LayerswapBridgeProvider implements BridgeProvider {
  readonly id = "layerswap";
  readonly supportedSourceChains: ChainId[] = [
    ChainId.MAINNET,
    ChainId.SEPOLIA,
  ];
  readonly supportedDestChains: ChainId[] = [ChainId.MAINNET, ChainId.SEPOLIA];

  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch available routes from Layerswap API.
   */
  private async fetchRoutes(): Promise<LayerswapRoutesResponse["data"]> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(
        `${LAYERSWAP_API.BASE_URL}${LAYERSWAP_API.ROUTES_ENDPOINT}?to_chain=${LAYERSWAP_CHAINS.STARKNET_MAINNET}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Layerswap API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.warn("Failed to fetch Layerswap routes:", error);
      return [];
    }
  }

  /**
   * Fetch a quote from Layerswap API.
   */
  private async fetchQuote(
    request: BridgeRequest
  ): Promise<LayerswapQuoteResponse | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const body = {
        from_chain: request.sourceChainId.isMainnet()
          ? "ETHEREUM_MAINNET"
          : "ETHEREUM_SEPOLIA",
        to_chain: request.sourceChainId.isMainnet()
          ? LAYERSWAP_CHAINS.STARKNET_MAINNET
          : LAYERSWAP_CHAINS.STARKNET_SEPOLIA,
        from_token: request.token.symbol,
        to_token: request.token.symbol,
        from_amount: request.amount.toBase().toString(),
        use_deposit_address: true,
      };

      const response = await fetch(
        `${LAYERSWAP_API.BASE_URL}${LAYERSWAP_API.SWAPS_ENDPOINT}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error(`Layerswap quote error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn("Failed to fetch Layerswap quote:", error);
      return null;
    }
  }

  supportsChainPair(sourceChainId: ChainId, destChainId: ChainId): boolean {
    return (
      this.supportedSourceChains.some((c) => c.value === sourceChainId.value) &&
      this.supportedDestChains.some((c) => c.value === destChainId.value)
    );
  }

  async getQuote(request: BridgeRequest): Promise<BridgeQuote> {
    const { sourceChainId, destChainId, token } = request;

    // Validate token is supported
    const network = sourceChainId.isMainnet()
      ? "STARKNET_MAINNET"
      : "STARKNET_SEPOLIA";
    const supportedTokens = LAYERSWAP_TOKENS[network];
    if (
      !supportedTokens ||
      !supportedTokens.some((t) => t === token.symbol.toUpperCase())
    ) {
      throw new Error(
        `Layerswap does not support token: ${token.symbol}. ` +
          `Supported tokens: ${supportedTokens?.join(", ") || "none"}`
      );
    }

    // Try to get real quote from API
    const apiQuote = await this.fetchQuote(request);

    let feeBase: bigint;
    let destAmountBase: bigint;
    let estimatedTime: number;

    if (apiQuote) {
      feeBase = BigInt(request.amount.toBase()) - BigInt(apiQuote.to_amount);
      destAmountBase = BigInt(apiQuote.to_amount);
      estimatedTime = apiQuote.estimated_arrival_time || 300;
    } else {
      // Fallback to estimate
      feeBase = this.estimateFee(token.symbol);
      destAmountBase = request.amount.toBase() - feeBase;
      estimatedTime = 300;
    }

    return {
      sourceChainId,
      destChainId,
      token,
      amountBase: request.amount.toBase(),
      destAmountBase,
      feeBase,
      estimatedTimeSeconds: estimatedTime,
      provider: "layerswap",
    };
  }

  async bridge(request: BridgeRequest): Promise<PreparedBridge> {
    const { sourceChainId, destChainId, token, amount, recipient } = request;

    // Validate token is supported
    const network = sourceChainId.isMainnet()
      ? "STARKNET_MAINNET"
      : "STARKNET_SEPOLIA";
    const supportedTokens = LAYERSWAP_TOKENS[network];
    if (
      !supportedTokens ||
      !supportedTokens.some((t) => t === token.symbol.toUpperCase())
    ) {
      throw new Error(
        `Layerswap does not support token: ${token.symbol}. ` +
          `Supported tokens: ${supportedTokens?.join(", ") || "none"}`
      );
    }

    // Get quote first
    const quote = await this.getQuote(request);

    // For Layerswap, the flow is:
    // 1. User sends tokens to Layerswap deposit address
    // 2. Layerswap detects the deposit
    // 3. Layerswap sends tokens to destination

    // This SDK doesn't execute the bridge directly - it provides the deposit address
    // The actual bridging happens outside (via CEX or other integration)

    // For L2→L2 within Starknet, we can do direct calls
    // For cross-chain, this would need a relayer or external integration

    let calls: Call[] = [];

    // For same-chain (L2→L2), use direct transfer
    if (sourceChainId.value === destChainId.value) {
      calls = [
        {
          contractAddress: token.address,
          entrypoint: "transfer",
          calldata: CallData.compile([recipient, amount.toBase()]),
        },
      ];
    }

    return {
      calls,
      quote,
    };
  }

  /**
   * Estimate fee as fallback.
   */
  private estimateFee(tokenSymbol: string): bigint {
    // Layerswap fees vary by route, but typically:
    // - Network fee + service fee
    const symbol = tokenSymbol.toUpperCase();
    if (symbol === "ETH") {
      return 500000000000000n; // ~0.0005 ETH estimate
    } else if (symbol === "STRK") {
      return 500000000000000n;
    }
    return 500000000000000n;
  }
}

/**
 * Default Layerswap provider instance.
 * Note: Requires API key for production use.
 */
export const layerswapBridge = new LayerswapBridgeProvider();

/**
 * Create Layerswap provider with API key.
 */
export function createLayerswapProvider(
  apiKey: string
): LayerswapBridgeProvider {
  return new LayerswapBridgeProvider(apiKey);
}
