import { ChainId } from "@/types";
import { CallData, type Call } from "starknet";
import type {
  BridgeProvider,
  BridgeQuote,
  BridgeRequest,
  PreparedBridge,
} from "@/bridge/interface";

/**
 * Orbiter bridge configuration.
 *
 * Official Orbiter router addresses on Starknet.
 * Source: Orbiter documentation
 *
 * IMPORTANT: These are Cairo CONTRACT-type routers.
 */
const ORBITER_ROUTERS: Record<string, string> = {
  // Starknet Mainnet
  SN_MAIN: "0x058680be0cf3f29c7a33474a218e5fed1ad213051cb2e9eac501a26852d64ca2",
  // Starknet Sepolia (testnet)
  SN_SEPOLIA:
    "0x045cf46534ccc555f5f80816b4f842780ad4cedd82825460310ff2e5e9aa999a",
} as const;

/**
 * Supported tokens on Orbiter.
 * Source: Orbiter documentation
 */
const ORBITER_TOKENS: Record<string, string[]> = {
  SN_MAIN: ["ETH", "STRK"],
  SN_SEPOLIA: ["ETH", "STRK"],
} as const;

/**
 * Orbiter API configuration.
 * Used for fetching real-time quotes.
 */
const ORBITER_API = {
  // Quote endpoint for getting bridge quotes
  QUOTE_URL: "https://api.orbiter.finance/quote",
  // Supported destination chains
  CHAIN_IDS: {
    ETHEREUM: "ETHEREUM",
    STARKNET: "STARKNET",
    SEPOLIA: "SEPOLIA",
    STARKNET_SEPOLIA: "STARKNET_SEPOLIA",
  } as const,
};

export class OrbiterBridgeProvider implements BridgeProvider {
  readonly id = "orbiter";
  readonly supportedSourceChains: ChainId[] = [
    ChainId.MAINNET,
    ChainId.SEPOLIA,
  ];
  readonly supportedDestChains: ChainId[] = [ChainId.MAINNET, ChainId.SEPOLIA];

  /**
   * Fetch a real-time quote from Orbiter API.
   * Falls back to estimate if API is unavailable.
   */
  private async fetchQuoteFromApi(request: BridgeRequest): Promise<{
    estimatedDestinationAmount: bigint;
    fee: bigint;
    estimatedTime: number;
  } | null> {
    try {
      const { sourceChainId, destChainId, token, amount } = request;

      // Map Starknet chain to Orbiter chain ID
      const srcChain = sourceChainId.isMainnet()
        ? ORBITER_API.CHAIN_IDS.STARKNET
        : ORBITER_API.CHAIN_IDS.STARKNET_SEPOLIA;
      const dstChain = destChainId.isMainnet()
        ? ORBITER_API.CHAIN_IDS.STARKNET
        : ORBITER_API.CHAIN_IDS.STARKNET_SEPOLIA;

      // Build quote request
      const quoteParams = new URLSearchParams({
        srcChain,
        dstChain,
        token: token.symbol,
        amount: amount.toBase().toString(),
      });

      const response = await fetch(
        `${ORBITER_API.QUOTE_URL}?${quoteParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        estimatedDestinationAmount: BigInt(
          data.estimatedDestinationAmount || 0
        ),
        fee: BigInt(data.fee || 0),
        estimatedTime: data.estimatedTime || 180,
      };
    } catch {
      // API unavailable, will use fallback
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
    const network = sourceChainId.isMainnet() ? "SN_MAIN" : "SN_SEPOLIA";
    const supportedTokens = ORBITER_TOKENS[network];
    if (!supportedTokens) {
      throw new Error(`Unsupported chain for Orbiter: ${sourceChainId.value}`);
    }
    if (!supportedTokens.includes(token.symbol.toUpperCase())) {
      throw new Error(
        `Orbiter does not support token: ${token.symbol}. ` +
          `Supported tokens: ${supportedTokens.join(", ")}`
      );
    }

    // Try to get real quote from API
    const apiQuote = await this.fetchQuoteFromApi(request);

    let feeBase: bigint;
    let destAmountBase: bigint;
    let estimatedTime: number;

    if (apiQuote) {
      feeBase = apiQuote.fee;
      destAmountBase = apiQuote.estimatedDestinationAmount;
      estimatedTime = apiQuote.estimatedTime;
    } else {
      // Fallback to estimated fee
      feeBase = this.estimateFee(token.symbol);
      destAmountBase = request.amount.toBase() - feeBase;
      estimatedTime = 180;
    }

    return {
      sourceChainId,
      destChainId,
      token,
      amountBase: request.amount.toBase(),
      destAmountBase,
      feeBase,
      estimatedTimeSeconds: estimatedTime,
      provider: "orbiter",
    };
  }

  async bridge(request: BridgeRequest): Promise<PreparedBridge> {
    const { sourceChainId, destChainId, token, amount, recipient } = request;

    // Validate token is supported
    const network = sourceChainId.isMainnet() ? "SN_MAIN" : "SN_SEPOLIA";
    const supportedTokens = ORBITER_TOKENS[network];
    if (!supportedTokens) {
      throw new Error(`Unsupported chain for Orbiter: ${sourceChainId.value}`);
    }
    if (!supportedTokens.includes(token.symbol.toUpperCase())) {
      throw new Error(
        `Orbiter does not support token: ${token.symbol}. ` +
          `Supported tokens: ${supportedTokens.join(", ")}`
      );
    }

    const quote = await this.getQuote(request);

    // Get router address for source chain
    const routerAddress = this.getRouterAddress(sourceChainId);

    // Build bridge calls
    // Orbiter router entrypoint for cross-chain transfer
    const calls: Call[] = [
      {
        contractAddress: routerAddress,
        entrypoint: "send_cross_chain_message",
        calldata: CallData.compile([
          this.mapToOrbiterChain(destChainId),
          recipient,
          token.address,
          amount.toBase(),
        ]),
      },
    ];

    return {
      calls,
      quote,
    };
  }

  /**
   * Get Orbiter router address for a chain.
   */
  private getRouterAddress(chainId: ChainId): string {
    const network = chainId.isMainnet() ? "SN_MAIN" : "SN_SEPOLIA";
    const router = ORBITER_ROUTERS[network];
    if (!router) {
      throw new Error(`Unsupported chain for Orbiter: ${chainId.value}`);
    }
    return router;
  }

  /**
   * Map Starknet chain to Orbiter chain identifier.
   */
  private mapToOrbiterChain(chainId: ChainId): string {
    if (chainId.isMainnet()) {
      return ORBITER_API.CHAIN_IDS.STARKNET;
    }
    return ORBITER_API.CHAIN_IDS.STARKNET_SEPOLIA;
  }

  /**
   * Estimate bridge fee as fallback.
   * Used when Orbiter API is unavailable.
   *
   * Note: These are rough estimates. Actual fees may vary.
   * For accurate fees, use getQuote() which queries the API.
   */
  private estimateFee(tokenSymbol: string): bigint {
    // Orbiter fees are approximately:
    // - ETH: 0.0001 ETH (~1-2 USD)
    // - STRK: 0.0001 STRK
    const symbol = tokenSymbol.toUpperCase();
    if (symbol === "ETH") {
      return 100000000000000n; // 0.0001 ETH in wei
    } else if (symbol === "STRK") {
      return 100000000000000n; // 0.0001 STRK (assuming 18 decimals)
    }
    // Default fallback
    return 100000000000000n;
  }
}

/**
 * Default Orbiter provider instance.
 */
export const orbiterBridge = new OrbiterBridgeProvider();
