import type {
  BridgeProvider,
  BridgeQuote,
  BridgeRequest,
  PreparedBridge,
} from "@/bridge/interface";

/**
 * Options for getting the best quote.
 */
export interface GetBestQuoteOptions {
  /** List of provider IDs to consider. If not provided, all registered providers are used. */
  providers?: string[];
  /** Maximum acceptable fee (in base units). */
  maxFee?: bigint;
  /** Maximum acceptable time in seconds. */
  maxTime?: number;
  /** Whether to prioritize lower fees (default: true). */
  prioritizeFees?: boolean;
}

/**
 * Result of the best quote search.
 */
export interface BestQuoteResult {
  /** The best quote found. */
  quote: BridgeQuote;
  /** The provider that returned this quote. */
  providerId: string;
  /** All quotes that were compared. */
  allQuotes: Array<{
    providerId: string;
    quote: BridgeQuote | null;
    error?: string;
  }>;
}

/**
 * BridgeAggregator compares quotes from multiple bridge providers
 * and returns the best option based on configurable criteria.
 *
 * @example
 * ```typescript
 * const aggregator = new BridgeAggregator([
 *   starkgateBridge,
 *   orbiterBridge,
 *   layerswapBridge,
 * ]);
 *
 * const result = await aggregator.getBestQuote({
 *   sourceChainId: ChainId.SEPOLIA,
 *   destChainId: ChainId.SEPOLIA,
 *   token: ethToken,
 *   amount: Amount.parse("0.1", ethToken),
 *   recipient: "0x123...",
 * }, { prioritizeFees: true });
 *
 * console.log(`Best: ${result.providerId}, Fee: ${result.quote.feeBase}`);
 * ```
 */
export class BridgeAggregator {
  private readonly providers: Map<string, BridgeProvider> = new Map();
  private readonly defaultProviders: BridgeProvider[] = [];

  /**
   * Create a new BridgeAggregator.
   * @param providers - Initial list of bridge providers to register.
   */
  constructor(providers: BridgeProvider[] = []) {
    for (const provider of providers) {
      this.registerProvider(provider);
    }
  }

  /**
   * Register a new bridge provider.
   */
  registerProvider(provider: BridgeProvider, makeDefault = true): void {
    this.providers.set(provider.id, provider);
    if (makeDefault) {
      this.defaultProviders.push(provider);
    }
  }

  /**
   * Unregister a bridge provider.
   */
  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  /**
   * Get a provider by ID.
   */
  getProvider(providerId: string): BridgeProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * List all registered provider IDs.
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get quotes from all providers in parallel.
   */
  async getAllQuotes(request: BridgeRequest): Promise<
    Array<{
      providerId: string;
      quote: BridgeQuote | null;
      error?: string;
    }>
  > {
    const providerIds = this.listProviders();
    const promises = providerIds.map(async (providerId) => {
      try {
        const provider = this.providers.get(providerId)!;
        const quote = await provider.getQuote(request);
        return { providerId, quote };
      } catch (error) {
        return {
          providerId,
          quote: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Get the best quote based on criteria.
   *
   * @param request - The bridge request.
   * @param options - Options for filtering and prioritizing quotes.
   * @returns The best quote result, or null if no valid quotes found.
   */
  async getBestQuote(
    request: BridgeRequest,
    options: GetBestQuoteOptions = {}
  ): Promise<BestQuoteResult | null> {
    const {
      providers: requestedProviders,
      maxFee,
      maxTime,
      prioritizeFees = true,
    } = options;

    // Get all quotes
    const allQuotes = await this.getAllQuotes(request);

    // Filter and score quotes
    const validQuotes = allQuotes
      .filter((item): item is { providerId: string; quote: BridgeQuote } => {
        // Must have a quote
        if (!item.quote) return false;

        // Filter by requested providers
        if (requestedProviders && requestedProviders.length > 0) {
          if (!requestedProviders.includes(item.providerId)) return false;
        }

        // Filter by max fee
        if (maxFee !== undefined && item.quote.feeBase > maxFee) return false;

        // Filter by max time
        if (
          maxTime !== undefined &&
          item.quote.estimatedTimeSeconds !== undefined &&
          item.quote.estimatedTimeSeconds > maxTime
        ) {
          return false;
        }

        return true;
      })
      .map((item) => ({
        ...item,
        // Calculate a score (lower is better)
        score: this.calculateScore(item.quote, prioritizeFees),
      }));

    if (validQuotes.length === 0) {
      return null;
    }

    // Sort by score (lower is better)
    validQuotes.sort((a, b) => {
      if (prioritizeFees) {
        // Primary: fee, Secondary: time
        if (a.quote.feeBase !== b.quote.feeBase) {
          return a.quote.feeBase < b.quote.feeBase ? -1 : 1;
        }
        return (
          (a.quote.estimatedTimeSeconds ?? 0) -
          (b.quote.estimatedTimeSeconds ?? 0)
        );
      } else {
        // Primary: time, Secondary: fee
        const timeA = a.quote.estimatedTimeSeconds ?? Infinity;
        const timeB = b.quote.estimatedTimeSeconds ?? Infinity;
        if (timeA !== timeB) return timeA < timeB ? -1 : 1;
        return a.quote.feeBase < b.quote.feeBase ? -1 : 1;
      }
    });

    const best = validQuotes[0]!;

    return {
      quote: best.quote,
      providerId: best.providerId,
      allQuotes,
    };
  }

  /**
   * Execute a bridge using the best quote.
   *
   * @param request - The bridge request.
   * @param options - Options for quote selection.
   * @returns The prepared bridge and the provider used.
   */
  async bridge(
    request: BridgeRequest,
    options: GetBestQuoteOptions = {}
  ): Promise<{ prepared: PreparedBridge; providerId: string } | null> {
    const bestQuote = await this.getBestQuote(request, options);

    if (!bestQuote) {
      return null;
    }

    const provider = this.providers.get(bestQuote.providerId);
    if (!provider) {
      return null;
    }

    const prepared = await provider.bridge(request);
    return { prepared, providerId: bestQuote.providerId };
  }

  /**
   * Calculate a score for a quote (lower is better).
   * Used for comparing quotes across providers.
   */
  private calculateScore(quote: BridgeQuote, prioritizeFees: boolean): number {
    // Normalize fee to a score (0-1000)
    // Assuming max reasonable fee is 0.01 ETH = 10000000000000000 wei
    const MAX_REASONABLE_FEE = 10000000000000000n;
    const feeScore = Number((quote.feeBase * 1000n) / MAX_REASONABLE_FEE);

    // Normalize time to a score (0-1000)
    // Assuming max reasonable time is 24 hours
    const MAX_REASONABLE_TIME = 86400;
    const timeScore = Number(
      ((quote.estimatedTimeSeconds ?? MAX_REASONABLE_TIME) * 1000) /
        MAX_REASONABLE_TIME
    );

    // Combine scores based on priority
    if (prioritizeFees) {
      // 70% fee, 30% time
      return feeScore * 0.7 + timeScore * 0.3;
    } else {
      // 30% fee, 70% time
      return feeScore * 0.3 + timeScore * 0.7;
    }
  }
}

/**
 * Default bridge aggregator with all supported providers.
 */
export const bridgeAggregator = new BridgeAggregator();

/**
 * Create a configured bridge aggregator.
 */
export function createBridgeAggregator(
  providers: BridgeProvider[]
): BridgeAggregator {
  return new BridgeAggregator(providers);
}
