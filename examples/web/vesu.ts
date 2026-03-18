type VesuTokenLike = {
  address: string;
  symbol: string;
};

export interface WebVesuMarketLike {
  poolAddress?: string;
  poolName?: string;
  asset: VesuTokenLike;
  canBeBorrowed?: boolean;
}

export interface WebVesuMarketOption {
  key: string;
  label: string;
  poolLabel: string;
  market: WebVesuMarketLike;
}

const FALLBACK_ASSETS = [
  { symbol: "STRK", canBorrow: false },
  { symbol: "USDC", canBorrow: true },
] as const;

const MARKET_PRIORITY = ["STRK", "ETH", "USDC", "USDT", "DAI", "WBTC"] as const;
const UNKNOWN_POOL_LABEL = "Pool unavailable";

export function getWebVesuPoolLabel(poolAddress?: string): string {
  if (!poolAddress) {
    return UNKNOWN_POOL_LABEL;
  }
  return `Pool ${poolAddress.slice(0, 6)}...${poolAddress.slice(-4)}`;
}

export function buildWebVesuMarketOptions(
  markets: WebVesuMarketLike[]
): WebVesuMarketOption[] {
  const deduped = new Map<string, WebVesuMarketLike>();
  for (const market of markets) {
    const key = buildMarketKey(market);
    if (!deduped.has(key)) {
      deduped.set(key, market);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => compareMarkets(left, right))
    .map((market) => {
      const poolLabel =
        market.poolName?.trim() || getWebVesuPoolLabel(market.poolAddress);
      return {
        key: buildMarketKey(market),
        label: `${market.asset.symbol} · ${poolLabel}`,
        poolLabel,
        market,
      };
    });
}

export function buildWebVesuDebtOptions(
  markets: WebVesuMarketLike[],
  collateralKey: string | null
): WebVesuMarketOption[] {
  const selected = buildWebVesuMarketOptions(markets).find(
    (option) => option.key === collateralKey
  );
  if (!selected) {
    return [];
  }

  const debtMarkets = new Map<string, WebVesuMarketLike>();
  for (const market of markets) {
    if ((market.poolAddress ?? "") !== (selected.market.poolAddress ?? "")) {
      continue;
    }
    if (market.canBeBorrowed === false) {
      continue;
    }
    if (market.asset.address === selected.market.asset.address) {
      continue;
    }
    if (!debtMarkets.has(market.asset.address)) {
      debtMarkets.set(market.asset.address, market);
    }
  }

  return buildWebVesuMarketOptions([...debtMarkets.values()]);
}

export function buildFallbackWebVesuMarkets(
  tokens: VesuTokenLike[]
): WebVesuMarketLike[] {
  const fallback: WebVesuMarketLike[] = [];
  for (const asset of FALLBACK_ASSETS) {
    const token = tokens.find((candidate) => candidate.symbol === asset.symbol);
    if (!token) {
      continue;
    }
    fallback.push({
      asset: token,
      canBeBorrowed: asset.canBorrow,
    });
  }
  return fallback;
}

function buildMarketKey(market: WebVesuMarketLike): string {
  return `${market.poolAddress ?? "default"}:${market.asset.address}`;
}

function compareMarkets(
  left: WebVesuMarketLike,
  right: WebVesuMarketLike
): number {
  const leftPool = left.poolAddress ?? "default";
  const rightPool = right.poolAddress ?? "default";
  const poolComparison = leftPool.localeCompare(rightPool);
  if (poolComparison !== 0) {
    return poolComparison;
  }

  const leftPriority = symbolPriority(left.asset.symbol);
  const rightPriority = symbolPriority(right.asset.symbol);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if ((left.canBeBorrowed ?? true) !== (right.canBeBorrowed ?? true)) {
    return left.canBeBorrowed === false ? 1 : -1;
  }

  return left.asset.symbol.localeCompare(right.asset.symbol);
}

function symbolPriority(symbol: string): number {
  const index = MARKET_PRIORITY.indexOf(
    symbol as (typeof MARKET_PRIORITY)[number]
  );
  return index === -1 ? MARKET_PRIORITY.length : index;
}
