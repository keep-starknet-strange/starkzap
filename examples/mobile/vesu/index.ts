import type {
  LendingHealth,
  LendingMarket,
  LendingPosition,
  Token,
} from "@starkzap/native";

export const VESU_PROVIDER_ID = "vesu" as const;

export const VESU_HEALTH_VALUE_SCALE = 10n ** 18n;

const MAINNET_FALLBACK_ASSETS = [
  { symbol: "STRK", canBorrow: false },
  { symbol: "USDC", canBorrow: true },
] as const;
const SEPOLIA_FALLBACK_ASSETS = [
  { symbol: "STRK", canBorrow: false },
  { symbol: "USDC", canBorrow: true },
] as const;
const DEFAULT_VESU_VAULT_SYMBOLS = ["STRK", "ETH", "USDC"] as const;
const DEFAULT_VESU_DEBT_SYMBOLS = ["USDC", "USDT", "DAI", "ETH"] as const;
const DEFAULT_VESU_COLLATERAL_SYMBOLS = [
  "STRK",
  "ETH",
  "WBTC",
  "USDC",
] as const;
const PERCENT_SCALE = 10_000n;
const DISPLAY_DECIMALS = 2;
const UNKNOWN_POOL_LABEL = "Pool unavailable";

const POOL_VISUAL_PRESETS = [
  {
    matches: ["prime", "genesis", "v1-"],
    shortLabel: "V",
    backgroundColor: "#111827",
    foregroundColor: "#f8fafc",
  },
  {
    matches: ["braavos"],
    shortLabel: "B",
    backgroundColor: "#1d4ed8",
    foregroundColor: "#eff6ff",
  },
  {
    matches: ["alterscope"],
    shortLabel: "A",
    backgroundColor: "#0f766e",
    foregroundColor: "#ecfeff",
  },
  {
    matches: ["carmine"],
    shortLabel: "C",
    backgroundColor: "#b91c1c",
    foregroundColor: "#fef2f2",
  },
  {
    matches: ["clearstar"],
    shortLabel: "C",
    backgroundColor: "#0369a1",
    foregroundColor: "#f0f9ff",
  },
  {
    matches: ["re7"],
    shortLabel: "R7",
    backgroundColor: "#3f3f46",
    foregroundColor: "#fafafa",
  },
] as const;

const DEFAULT_POOL_VISUALS = [
  {
    backgroundColor: "#0f172a",
    foregroundColor: "#f8fafc",
  },
  {
    backgroundColor: "#164e63",
    foregroundColor: "#ecfeff",
  },
  {
    backgroundColor: "#7c2d12",
    foregroundColor: "#fff7ed",
  },
  {
    backgroundColor: "#14532d",
    foregroundColor: "#f0fdf4",
  },
] as const;

type VesuAssetSource = "market" | "fallback";

interface ChainLike {
  isSepolia(): boolean;
}

export interface VesuAssetOption {
  key: string;
  token: Token;
  poolAddress?: LendingMarket["poolAddress"];
  canBorrow: boolean;
  source: VesuAssetSource;
}

interface VesuPoolGroup {
  key: string;
  label: string;
  poolAddress?: LendingMarket["poolAddress"];
  options: VesuAssetOption[];
}

export interface VesuApiDecimalValue {
  decimals: number;
  value: string;
}

export interface VesuApiMarketItem {
  address?: string;
  decimals?: number;
  name?: string;
  symbol?: string;
  pool?: {
    id?: string;
    name?: string;
    isDeprecated?: boolean;
  };
  protocolVersion?: string;
  stats?: {
    borrowApr?: VesuApiDecimalValue | null;
    canBeBorrowed?: boolean;
    currentUtilization?: VesuApiDecimalValue | null;
    supplyApy?: VesuApiDecimalValue | null;
    totalDebt?: VesuApiDecimalValue | null;
    totalSupplied?: VesuApiDecimalValue | null;
  };
}

// ---------------------------------------------------------------------------
// Pool API types (api.vesu.xyz/pools/{poolId})
// ---------------------------------------------------------------------------

export interface VesuPoolAssetConfig {
  debtFloor?: VesuApiDecimalValue;
}

export interface VesuPoolAsset {
  address: string;
  symbol: string;
  decimals: number;
  usdPrice?: VesuApiDecimalValue;
  config?: VesuPoolAssetConfig;
}

export interface VesuPoolPair {
  collateralAssetAddress: string;
  debtAssetAddress: string;
  maxLTV?: VesuApiDecimalValue;
}

export interface VesuPoolData {
  id: string;
  name?: string | null;
  assets: VesuPoolAsset[];
  pairs: VesuPoolPair[];
}

const VESU_POOL_API_BASE = "https://api.vesu.xyz/pools";

export async function fetchVesuPoolData(
  poolAddress: string
): Promise<VesuPoolData | null> {
  try {
    const response = await fetch(
      `${VESU_POOL_API_BASE}/${poolAddress}?onlyEnabledAssets=true`
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: VesuPoolData };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the debt floor (in USD, 18 decimals) for a specific debt asset in a pool.
 */
export function getVesuDebtFloor(
  pool: VesuPoolData,
  debtAssetAddress: string
): bigint | null {
  const asset = pool.assets.find(
    (a) => a.address.toLowerCase() === debtAssetAddress.toLowerCase()
  );
  if (!asset?.config?.debtFloor?.value) return null;
  return BigInt(asset.config.debtFloor.value);
}

/**
 * Format the debt floor as a USD string (e.g. "$10").
 */
export function formatVesuDebtFloor(debtFloor: bigint): string {
  const usd = Number(debtFloor) / 1e18;
  return `$${usd.toFixed(usd % 1 === 0 ? 0 : 2)}`;
}

export interface VesuMarketCard {
  key: string;
  option: VesuAssetOption;
  poolLabel: string;
  totalSuppliedLabel: string;
  totalBorrowedLabel: string;
  supplyAprLabel: string;
  borrowAprLabel: string;
  collateralTokens: Token[];
}

export interface VesuPoolVisual {
  shortLabel: string;
  backgroundColor: string;
  foregroundColor: string;
}

export function buildVesuAssetOptions(params: {
  chainId: ChainLike;
  markets: LendingMarket[];
  tokens: Token[];
}): VesuAssetOption[] {
  const options = new Map<string, VesuAssetOption>();

  for (const market of sortVesuMarkets(params.markets)) {
    const key = `${market.poolAddress}:${market.asset.address}`;
    if (options.has(key)) {
      continue;
    }
    options.set(key, {
      key,
      token: market.asset,
      poolAddress: market.poolAddress,
      canBorrow: market.canBeBorrowed !== false,
      source: "market",
    });
  }

  for (const fallbackAsset of getFallbackAssets(params.chainId)) {
    const token = params.tokens.find(
      (candidate) => candidate.symbol === fallbackAsset.symbol
    );
    if (
      !token ||
      Array.from(options.values()).some(
        (existing) => existing.token.address === token.address
      )
    ) {
      continue;
    }
    options.set(token.address, {
      key: token.address,
      token,
      canBorrow: fallbackAsset.canBorrow,
      source: "fallback",
    });
  }

  return Array.from(options.values()).sort((left, right) => {
    const poolComparison = getPoolSortKey(left.poolAddress).localeCompare(
      getPoolSortKey(right.poolAddress)
    );
    if (poolComparison !== 0) {
      return poolComparison;
    }
    const leftPriority = getAssetPriority(left.token.symbol);
    const rightPriority = getAssetPriority(right.token.symbol);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    if (left.canBorrow !== right.canBorrow) {
      return left.canBorrow ? -1 : 1;
    }
    return left.token.symbol.localeCompare(right.token.symbol);
  });
}

function groupVesuAssetOptionsByPool(
  options: VesuAssetOption[]
): VesuPoolGroup[] {
  const groups = new Map<string, VesuPoolGroup>();

  for (const option of options) {
    const key = option.poolAddress ?? "default";
    const group = groups.get(key);
    if (group) {
      group.options.push(option);
      continue;
    }

    groups.set(key, {
      key,
      label: getVesuPoolLabel(option.poolAddress),
      poolAddress: option.poolAddress,
      options: [option],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    options: [...group.options].sort((left, right) => {
      const leftPriority = getAssetPriority(left.token.symbol);
      const rightPriority = getAssetPriority(right.token.symbol);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (left.canBorrow !== right.canBorrow) {
        return left.canBorrow ? -1 : 1;
      }
      return left.token.symbol.localeCompare(right.token.symbol);
    }),
  }));
}

export function buildVesuMarketCards(params: {
  options: VesuAssetOption[];
  apiMarkets: VesuApiMarketItem[];
  knownTokens: Token[];
}): VesuMarketCard[] {
  const apiByKey = new Map<string, VesuApiMarketItem>();
  for (const market of params.apiMarkets) {
    if (!market.pool?.id || !market.address) {
      continue;
    }
    apiByKey.set(`${market.pool.id}:${market.address}`, market);
  }

  const tokenLookup = buildKnownTokenLookup(params.knownTokens);
  const poolGroups = groupVesuAssetOptionsByPool(params.options);
  const collateralByPool = new Map<string, Token[]>(
    poolGroups.map((group) => [
      group.key,
      group.options.map((option) =>
        resolveDisplayToken(option.token, tokenLookup)
      ),
    ])
  );

  return [...params.options]
    .map((option) => {
      const apiMarket = apiByKey.get(option.key);
      const token = resolveDisplayToken(option.token, tokenLookup, apiMarket);
      const poolLabel =
        apiMarket?.pool?.name?.trim() || getVesuPoolLabel(option.poolAddress);
      const collateralTokens = (
        collateralByPool.get(option.poolAddress ?? "default") ?? []
      )
        .filter((candidate) => candidate.address !== token.address)
        .slice(0, 6);

      return {
        key: option.key,
        option: {
          ...option,
          token,
          canBorrow: apiMarket?.stats?.canBeBorrowed ?? option.canBorrow,
        },
        poolLabel,
        totalSuppliedLabel: formatVesuCompactUsd(
          apiMarket?.stats?.totalSupplied
        ),
        totalBorrowedLabel: formatVesuCompactUsd(apiMarket?.stats?.totalDebt),
        supplyAprLabel: formatVesuRate(apiMarket?.stats?.supplyApy),
        borrowAprLabel: option.canBorrow
          ? formatVesuRate(apiMarket?.stats?.borrowApr)
          : "N/A",
        collateralTokens,
      } satisfies VesuMarketCard;
    })
    .sort((left, right) => {
      const leftValue = decimalValueToNumber(
        apiByKey.get(left.key)?.stats?.totalSupplied ?? null
      );
      const rightValue = decimalValueToNumber(
        apiByKey.get(right.key)?.stats?.totalSupplied ?? null
      );
      if (leftValue !== rightValue) {
        return rightValue - leftValue;
      }
      const leftPriority = getAssetPriority(left.option.token.symbol);
      const rightPriority = getAssetPriority(right.option.token.symbol);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.option.token.symbol.localeCompare(right.option.token.symbol);
    });
}

export function getAvailableVesuCollateralAssets(
  options: VesuAssetOption[],
  debtAsset: VesuAssetOption | null
): VesuAssetOption[] {
  const uniqueByAddress = new Map<string, VesuAssetOption>();
  for (const option of options) {
    if (
      debtAsset?.poolAddress &&
      option.poolAddress &&
      option.poolAddress !== debtAsset.poolAddress
    ) {
      continue;
    }
    if (debtAsset && option.token.address === debtAsset.token.address) {
      continue;
    }
    if (!uniqueByAddress.has(option.token.address)) {
      uniqueByAddress.set(option.token.address, option);
    }
  }

  return Array.from(uniqueByAddress.values()).sort((left, right) => {
    const leftPriority = getCollateralPriority(left.token.symbol);
    const rightPriority = getCollateralPriority(right.token.symbol);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.token.symbol.localeCompare(right.token.symbol);
  });
}

/**
 * Returns borrowable assets from the same pool, excluding the collateral asset.
 */
export function getAvailableVesuDebtAssets(
  options: VesuAssetOption[],
  collateralAsset: VesuAssetOption | null
): VesuAssetOption[] {
  const uniqueByAddress = new Map<string, VesuAssetOption>();
  for (const option of options) {
    if (!option.canBorrow) continue;
    if (
      collateralAsset?.poolAddress &&
      option.poolAddress &&
      option.poolAddress !== collateralAsset.poolAddress
    ) {
      continue;
    }
    if (
      collateralAsset &&
      option.token.address === collateralAsset.token.address
    ) {
      continue;
    }
    if (!uniqueByAddress.has(option.token.address)) {
      uniqueByAddress.set(option.token.address, option);
    }
  }

  return Array.from(uniqueByAddress.values()).sort((left, right) => {
    const leftPriority = getAssetPriority(left.token.symbol);
    const rightPriority = getAssetPriority(right.token.symbol);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.token.symbol.localeCompare(right.token.symbol);
  });
}

export function getDefaultVesuDebtAsset(
  options: VesuAssetOption[],
  collateralAsset: VesuAssetOption | null
): VesuAssetOption | null {
  return (
    getPreferredOption(
      getAvailableVesuDebtAssets(options, collateralAsset),
      DEFAULT_VESU_DEBT_SYMBOLS
    ) ?? null
  );
}

export function getDefaultVesuCollateralAsset(
  options: VesuAssetOption[],
  debtAsset: VesuAssetOption | null
): VesuAssetOption | null {
  return (
    getPreferredOption(
      getAvailableVesuCollateralAssets(options, debtAsset),
      DEFAULT_VESU_COLLATERAL_SYMBOLS
    ) ?? null
  );
}

export function formatVesuUsdValue(value: bigint | null | undefined): string {
  if (value == null) {
    return "—";
  }

  const integer = value / VESU_HEALTH_VALUE_SCALE;
  const fraction = value % VESU_HEALTH_VALUE_SCALE;
  const scaledFraction =
    (fraction * 10n ** BigInt(DISPLAY_DECIMALS)) / VESU_HEALTH_VALUE_SCALE;

  return `$${insertThousandsSeparators(integer)}.${scaledFraction
    .toString()
    .padStart(DISPLAY_DECIMALS, "0")}`;
}

export function formatVesuCompactUsd(
  value: VesuApiDecimalValue | null | undefined
): string {
  const numeric = decimalValueToNumber(value);
  if (numeric <= 0) {
    return "$0";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatVesuRate(
  value: VesuApiDecimalValue | null | undefined
): string {
  if (!value) {
    return "N/A";
  }
  const numeric = decimalValueToNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatVesuLtv(
  health: LendingHealth | null | undefined
): string {
  if (!health) {
    return "—";
  }
  if (health.collateralValue === 0n) {
    return health.debtValue === 0n ? "0.00%" : "—";
  }

  const basisPoints =
    (health.debtValue * PERCENT_SCALE) / health.collateralValue;
  const integer = basisPoints / 100n;
  const fraction = basisPoints % 100n;
  return `${integer.toString()}.${fraction.toString().padStart(2, "0")}%`;
}

export function getVesuHealthStatus(
  health: LendingHealth | null | undefined,
  position: LendingPosition | null | undefined
): string {
  if (!health) {
    return "Loading";
  }
  if (!hasVesuExposure(position)) {
    return "No open position";
  }
  return health.isCollateralized ? "Healthy" : "At risk";
}

export function hasVesuExposure(
  position: LendingPosition | null | undefined
): boolean {
  if (!position) {
    return false;
  }

  return (
    position.collateralShares > 0n ||
    position.nominalDebt > 0n ||
    (position.collateralAmount ?? 0n) > 0n ||
    (position.debtAmount ?? 0n) > 0n
  );
}

export function getVesuPoolLabel(
  poolAddress: LendingMarket["poolAddress"] | undefined
): string {
  if (!poolAddress) {
    return UNKNOWN_POOL_LABEL;
  }
  return `Pool ${poolAddress.slice(0, 6)}...${poolAddress.slice(-4)}`;
}

export function getVesuPoolVisual(poolLabel: string): VesuPoolVisual {
  const normalizedLabel = poolLabel.trim().toLowerCase();
  if (
    !normalizedLabel ||
    normalizedLabel === UNKNOWN_POOL_LABEL.toLowerCase()
  ) {
    return {
      shortLabel: "?",
      backgroundColor: "#52525b",
      foregroundColor: "#fafafa",
    };
  }

  const preset = POOL_VISUAL_PRESETS.find(({ matches }) =>
    matches.some((match) => normalizedLabel.includes(match))
  );
  if (preset) {
    return {
      shortLabel: preset.shortLabel,
      backgroundColor: preset.backgroundColor,
      foregroundColor: preset.foregroundColor,
    };
  }

  const palette =
    DEFAULT_POOL_VISUALS[
      hashPoolLabel(normalizedLabel) % DEFAULT_POOL_VISUALS.length
    ];

  return {
    shortLabel: getPoolShortLabel(poolLabel),
    backgroundColor: palette.backgroundColor,
    foregroundColor: palette.foregroundColor,
  };
}

function sortVesuMarkets(markets: LendingMarket[]): LendingMarket[] {
  return [...markets].sort((left, right) => {
    const poolComparison = left.poolAddress.localeCompare(right.poolAddress);
    if (poolComparison !== 0) {
      return poolComparison;
    }
    if ((left.canBeBorrowed ?? true) !== (right.canBeBorrowed ?? true)) {
      return left.canBeBorrowed === false ? 1 : -1;
    }
    return left.asset.symbol.localeCompare(right.asset.symbol);
  });
}

function getPreferredOption(
  options: VesuAssetOption[],
  preferredSymbols: readonly string[]
): VesuAssetOption | null {
  for (const symbol of preferredSymbols) {
    const option = options.find(
      (candidate) => candidate.token.symbol === symbol
    );
    if (option) {
      return option;
    }
  }

  return options[0] ?? null;
}

function getFallbackAssets(
  chainId: ChainLike
): readonly { symbol: string; canBorrow: boolean }[] {
  return chainId.isSepolia()
    ? SEPOLIA_FALLBACK_ASSETS
    : MAINNET_FALLBACK_ASSETS;
}

function buildKnownTokenLookup(knownTokens: Token[]): {
  byAddress: Map<string, Token>;
  bySymbol: Map<string, Token>;
  byName: Map<string, Token>;
} {
  const byAddress = new Map<string, Token>();
  const bySymbol = new Map<string, Token>();
  const byName = new Map<string, Token>();

  for (const token of knownTokens) {
    byAddress.set(token.address, token);

    if (!token.metadata?.logoUrl) {
      continue;
    }

    const normalizedSymbol = normalizeTokenAlias(token.symbol);
    if (normalizedSymbol && !bySymbol.has(normalizedSymbol)) {
      bySymbol.set(normalizedSymbol, token);
    }

    const normalizedName = normalizeTokenAlias(token.name);
    if (normalizedName && !byName.has(normalizedName)) {
      byName.set(normalizedName, token);
    }
  }

  return { byAddress, bySymbol, byName };
}

function resolveDisplayToken(
  token: Token,
  tokenLookup: {
    byAddress: Map<string, Token>;
    bySymbol: Map<string, Token>;
    byName: Map<string, Token>;
  },
  apiMarket?: VesuApiMarketItem
): Token {
  const exactMatch = tokenLookup.byAddress.get(token.address);
  if (exactMatch?.metadata?.logoUrl) {
    return exactMatch;
  }

  const symbolMatch = findTokenByAlias(tokenLookup.bySymbol, [
    token.symbol,
    apiMarket?.symbol,
  ]);
  if (symbolMatch) {
    return mergeDisplayTokenMetadata(token, symbolMatch);
  }

  const nameMatch = findTokenByAlias(tokenLookup.byName, [
    token.name,
    apiMarket?.name,
  ]);
  if (nameMatch) {
    return mergeDisplayTokenMetadata(token, nameMatch);
  }

  return exactMatch ?? token;
}

function findTokenByAlias(
  candidates: Map<string, Token>,
  aliases: (string | undefined)[]
): Token | null {
  for (const alias of aliases) {
    const normalizedAlias = normalizeTokenAlias(alias);
    if (!normalizedAlias) {
      continue;
    }
    const candidate = candidates.get(normalizedAlias);
    if (candidate?.metadata?.logoUrl) {
      return candidate;
    }
  }
  return null;
}

function mergeDisplayTokenMetadata(token: Token, source: Token): Token {
  if (!source.metadata?.logoUrl) {
    return token;
  }

  return {
    ...token,
    metadata: {
      ...token.metadata,
      logoUrl: token.metadata?.logoUrl ?? source.metadata.logoUrl,
    },
  };
}

function getPoolSortKey(
  poolAddress: LendingMarket["poolAddress"] | undefined
): string {
  return poolAddress ?? "default";
}

function decimalValueToNumber(
  value: VesuApiDecimalValue | null | undefined
): number {
  if (!value) {
    return 0;
  }
  const divisor = 10 ** value.decimals;
  return Number(value.value) / divisor;
}

function getAssetPriority(symbol: string): number {
  const fallbackSymbols: string[] = [
    ...DEFAULT_VESU_DEBT_SYMBOLS,
    ...DEFAULT_VESU_VAULT_SYMBOLS,
    ...DEFAULT_VESU_COLLATERAL_SYMBOLS,
  ];
  const index = fallbackSymbols.indexOf(symbol);
  return index === -1 ? fallbackSymbols.length : index;
}

function getCollateralPriority(symbol: string): number {
  const symbols: string[] = [...DEFAULT_VESU_COLLATERAL_SYMBOLS];
  const index = symbols.indexOf(symbol);
  return index === -1 ? symbols.length : index;
}

function insertThousandsSeparators(value: bigint): string {
  const digits = value.toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getPoolShortLabel(poolLabel: string): string {
  const words = poolLabel
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function hashPoolLabel(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function normalizeTokenAlias(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
