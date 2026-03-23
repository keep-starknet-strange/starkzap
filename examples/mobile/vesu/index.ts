import {
  Amount,
  type LendingHealth,
  type LendingMarket,
  type LendingPosition,
  type LendingUserPosition,
  type Token,
} from "starkzap-native";
import { PERCENT_SCALE, sameAddress } from "./utils";

export const VESU_PROVIDER_ID = "vesu" as const;

export const VESU_HEALTH_VALUE_SCALE = 10n ** 18n;
const VESU_BASIS_POINTS_SCALE = 10_000n;
const VESU_MAX_BORROW_SAFETY_BPS = 9_900n;
const VESU_CLOSE_REPAY_BUFFER_DECIMALS = 5;

const FALLBACK_ASSETS = [
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
const DISPLAY_DECIMALS = 2;
const UNKNOWN_POOL_LABEL = "Pool unavailable";
const VESU_POOL_REQUEST_TIMEOUT_MS = 8_000;

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

// ---------------------------------------------------------------------------
// Pool API types (api.vesu.xyz/pools/{poolId})
// ---------------------------------------------------------------------------

interface VesuApiDecimalValue {
  decimals: number;
  value: string;
}

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
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    VESU_POOL_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${VESU_POOL_API_BASE}/${poolAddress}?onlyEnabledAssets=true`,
      { signal: controller.signal }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: VesuPoolData };
    return payload.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
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
  const dollars = debtFloor / VESU_HEALTH_VALUE_SCALE;
  const remainder = debtFloor % VESU_HEALTH_VALUE_SCALE;
  const cents = (remainder * 100n) / VESU_HEALTH_VALUE_SCALE;

  if (cents <= 0n) {
    return `$${dollars.toString()}`;
  }

  return `$${dollars.toString()}.${cents.toString().padStart(2, "0")}`;
}

export function getVesuBorrowCapacityForDeposit(params: {
  pool: VesuPoolData | null | undefined;
  collateralToken: Token;
  debtToken: Token;
  depositAmount?: Amount | null;
  currentMaxBorrowAmount?: bigint | null;
}): bigint | null {
  const baseline = params.currentMaxBorrowAmount ?? 0n;
  const depositRaw = params.depositAmount?.toBase() ?? 0n;
  if (depositRaw <= 0n) {
    return baseline;
  }

  const collateralPrice = getPoolAssetUsdPrice(
    params.pool,
    params.collateralToken
  );
  const debtPrice = getPoolAssetUsdPrice(params.pool, params.debtToken);
  const maxLtv = getPoolPairMaxLtv(
    params.pool,
    params.collateralToken.address,
    params.debtToken.address
  );
  if (collateralPrice == null || debtPrice == null || maxLtv == null) {
    return baseline;
  }

  const effectiveMaxLtv =
    (maxLtv * VESU_MAX_BORROW_SAFETY_BPS) / VESU_BASIS_POINTS_SCALE;
  if (effectiveMaxLtv <= 0n || debtPrice <= 0n) {
    return baseline;
  }

  const collateralScale = 10n ** BigInt(params.collateralToken.decimals);
  const debtScale = 10n ** BigInt(params.debtToken.decimals);
  const additionalCollateralValue =
    (depositRaw * collateralPrice) / collateralScale;
  const additionalBorrowValue =
    (additionalCollateralValue * effectiveMaxLtv) / VESU_HEALTH_VALUE_SCALE;
  const additionalBorrowAmount =
    (additionalBorrowValue * debtScale) / debtPrice;

  return baseline + additionalBorrowAmount;
}

export function getVesuMinimumDepositForBorrow(params: {
  pool: VesuPoolData | null | undefined;
  collateralToken: Token;
  debtToken: Token;
  borrowAmount?: Amount | null;
  currentMaxBorrowAmount?: bigint | null;
}): bigint | null {
  const targetBorrow = params.borrowAmount?.toBase() ?? 0n;
  const baseline = params.currentMaxBorrowAmount ?? 0n;
  const shortfall = targetBorrow - baseline;
  if (shortfall <= 0n) {
    return 0n;
  }

  const collateralPrice = getPoolAssetUsdPrice(
    params.pool,
    params.collateralToken
  );
  const debtPrice = getPoolAssetUsdPrice(params.pool, params.debtToken);
  const maxLtv = getPoolPairMaxLtv(
    params.pool,
    params.collateralToken.address,
    params.debtToken.address
  );
  if (collateralPrice == null || debtPrice == null || maxLtv == null) {
    return null;
  }

  const effectiveMaxLtv =
    (maxLtv * VESU_MAX_BORROW_SAFETY_BPS) / VESU_BASIS_POINTS_SCALE;
  if (effectiveMaxLtv <= 0n || collateralPrice <= 0n) {
    return null;
  }

  const collateralScale = 10n ** BigInt(params.collateralToken.decimals);
  const debtScale = 10n ** BigInt(params.debtToken.decimals);
  const additionalBorrowValue = ceilDiv(shortfall * debtPrice, debtScale);
  const requiredCollateralValue = ceilDiv(
    additionalBorrowValue * VESU_HEALTH_VALUE_SCALE,
    effectiveMaxLtv
  );
  return ceilDiv(requiredCollateralValue * collateralScale, collateralPrice);
}

export function getVesuCloseRepayAmount(params: {
  debtAmount?: bigint | null;
  debtToken: Token;
}): bigint | null {
  const debtAmount = params.debtAmount ?? 0n;
  if (debtAmount <= 0n) {
    return null;
  }

  return debtAmount + getVesuCloseRepayBuffer(params.debtToken.decimals);
}

export function getVesuRepaySubmissionAmount(params: {
  debtToken: Token;
  debtAmount?: Amount | null;
  collateralAmount?: Amount | null;
  currentDebtAmount?: bigint | null;
  walletDebtBalance?: bigint | null;
}): Amount | null {
  const requestedDebtAmount = params.debtAmount;
  if (requestedDebtAmount) {
    const currentDebtAmount = params.currentDebtAmount ?? 0n;
    const closeRepayAmount = getVesuCloseRepayAmount({
      debtAmount: params.currentDebtAmount,
      debtToken: params.debtToken,
    });
    if (
      closeRepayAmount != null &&
      requestedDebtAmount.toBase() >= currentDebtAmount &&
      (params.walletDebtBalance ?? 0n) >= closeRepayAmount
    ) {
      return Amount.fromRaw(closeRepayAmount, params.debtToken);
    }
    return requestedDebtAmount;
  }

  if ((params.collateralAmount?.toBase() ?? 0n) > 0n) {
    return Amount.fromRaw(0n, params.debtToken);
  }

  return null;
}

export function getVesuUserPositionForMarket(params: {
  userPositions: LendingUserPosition[];
  token: Token;
  poolAddress?: LendingMarket["poolAddress"];
  type?: LendingUserPosition["type"];
}): LendingUserPosition | null {
  const types = params.type ? [params.type] : (["borrow", "earn"] as const);

  for (const type of types) {
    const match =
      params.userPositions.find(
        (position) =>
          position.type === type &&
          sameAddress(
            position.collateral.token.address,
            params.token.address
          ) &&
          (!params.poolAddress ||
            sameAddress(position.pool.id, params.poolAddress))
      ) ?? null;
    if (match) {
      return match;
    }
  }

  return null;
}

export function getVesuPositionBadgeLabel(
  position: LendingUserPosition
): string {
  if (position.type === "borrow") {
    return position.debt
      ? `Borrowing ${Amount.fromRaw(position.debt.amount, position.debt.token).toUnit()} ${position.debt.token.symbol}`
      : "Borrow position open";
  }

  return `${Amount.fromRaw(position.collateral.amount, position.collateral.token).toUnit()} ${position.collateral.token.symbol} deposited`;
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

  for (const fallbackAsset of FALLBACK_ASSETS) {
    const token = params.tokens.find(
      (candidate) => candidate.symbol === fallbackAsset.symbol
    );
    if (
      !token ||
      Array.from(options.values()).some((existing) =>
        sameAddress(existing.token.address, token.address)
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
    const poolComparison = (left.poolAddress ?? "default").localeCompare(
      right.poolAddress ?? "default"
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
    } else {
      groups.set(key, {
        key,
        label: getVesuPoolLabel(option.poolAddress),
        poolAddress: option.poolAddress,
        options: [option],
      });
    }
  }

  return Array.from(groups.values());
}

export function buildVesuMarketCards(params: {
  options: VesuAssetOption[];
  markets: LendingMarket[];
  knownTokens: Token[];
}): VesuMarketCard[] {
  const marketByKey = new Map<string, LendingMarket>();
  for (const market of params.markets) {
    marketByKey.set(`${market.poolAddress}:${market.asset.address}`, market);
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
      const market = marketByKey.get(option.key);
      const token = resolveDisplayToken(option.token, tokenLookup);
      const canBorrow = market?.canBeBorrowed ?? option.canBorrow;
      const poolLabel =
        market?.poolName?.trim() || getVesuPoolLabel(option.poolAddress);
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
          canBorrow,
        },
        poolLabel,
        totalSuppliedLabel: formatVesuCompactUsd(market?.stats?.totalSupplied),
        totalBorrowedLabel: formatVesuCompactUsd(market?.stats?.totalBorrowed),
        supplyAprLabel: formatVesuRate(market?.stats?.supplyApy),
        borrowAprLabel: canBorrow
          ? formatVesuRate(market?.stats?.borrowApr)
          : "N/A",
        collateralTokens,
      } satisfies VesuMarketCard;
    })
    .sort((left, right) => {
      const leftSupplied = marketByKey.get(left.key)?.stats?.totalSupplied;
      const rightSupplied = marketByKey.get(right.key)?.stats?.totalSupplied;
      const leftValue = amountToNumber(leftSupplied);
      const rightValue = amountToNumber(rightSupplied);
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

/** Filter options to unique-by-address, same-pool, excluding a counterpart asset. */
function filterUniquePoolAssets(
  options: VesuAssetOption[],
  counterpart: VesuAssetOption | null,
  extraFilter?: (option: VesuAssetOption) => boolean
): VesuAssetOption[] {
  const seen = new Map<string, VesuAssetOption>();
  for (const option of options) {
    if (extraFilter && !extraFilter(option)) continue;
    if (
      counterpart?.poolAddress &&
      option.poolAddress !== counterpart.poolAddress
    )
      continue;
    if (
      counterpart &&
      sameAddress(option.token.address, counterpart.token.address)
    )
      continue;
    if (!seen.has(option.token.address)) seen.set(option.token.address, option);
  }
  return Array.from(seen.values());
}

function sortByPriority(
  options: VesuAssetOption[],
  priority: (symbol: string) => number
): VesuAssetOption[] {
  return options.sort((a, b) => {
    const p = priority(a.token.symbol) - priority(b.token.symbol);
    return p !== 0 ? p : a.token.symbol.localeCompare(b.token.symbol);
  });
}

export function getAvailableVesuCollateralAssets(
  options: VesuAssetOption[],
  debtAsset: VesuAssetOption | null
): VesuAssetOption[] {
  return sortByPriority(
    filterUniquePoolAssets(options, debtAsset),
    getCollateralPriority
  );
}

/** Returns borrowable assets from the same pool, excluding the collateral asset. */
export function getAvailableVesuDebtAssets(
  options: VesuAssetOption[],
  collateralAsset: VesuAssetOption | null
): VesuAssetOption[] {
  return sortByPriority(
    filterUniquePoolAssets(options, collateralAsset, (o) => o.canBorrow),
    getAssetPriority
  );
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

export function formatVesuCompactUsd(value: Amount | undefined): string {
  const numeric = amountToNumber(value);
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

export function formatVesuRate(value: Amount | undefined): string {
  if (!value) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(amountToNumber(value));
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

interface TokenLookup {
  byAddress: Map<string, Token>;
  bySymbol: Map<string, Token>;
}

function buildKnownTokenLookup(knownTokens: Token[]): TokenLookup {
  const byAddress = new Map<string, Token>();
  const bySymbol = new Map<string, Token>();

  for (const token of knownTokens) {
    byAddress.set(token.address, token);
    if (token.metadata?.logoUrl) {
      const key = normalizeTokenAlias(token.symbol);
      if (key && !bySymbol.has(key)) bySymbol.set(key, token);
    }
  }

  return { byAddress, bySymbol };
}

function resolveDisplayToken(token: Token, lookup: TokenLookup): Token {
  const exact = lookup.byAddress.get(token.address);
  if (exact?.metadata?.logoUrl) return exact;

  // Try symbol match for logo metadata
  const key = normalizeTokenAlias(token.symbol);
  if (key) {
    const match = lookup.bySymbol.get(key);
    if (match?.metadata?.logoUrl) {
      return {
        ...token,
        metadata: { ...token.metadata, logoUrl: match.metadata.logoUrl },
      };
    }
  }

  return exact ?? token;
}

function amountToNumber(value: Amount | undefined): number {
  if (!value) return 0;
  return Number(value.toUnit());
}

function getPoolAssetUsdPrice(
  pool: VesuPoolData | null | undefined,
  token: Token
): bigint | null {
  const asset = pool?.assets.find((candidate) =>
    sameAddress(candidate.address, token.address)
  );
  if (!asset?.usdPrice?.value) {
    return null;
  }
  return normalizeVesuDecimal(asset.usdPrice.value, asset.usdPrice.decimals);
}

function getPoolPairMaxLtv(
  pool: VesuPoolData | null | undefined,
  collateralAssetAddress: string,
  debtAssetAddress: string
): bigint | null {
  const pair = pool?.pairs.find(
    (candidate) =>
      sameAddress(candidate.collateralAssetAddress, collateralAssetAddress) &&
      sameAddress(candidate.debtAssetAddress, debtAssetAddress)
  );
  if (!pair?.maxLTV?.value) {
    return null;
  }
  return normalizeVesuDecimal(pair.maxLTV.value, pair.maxLTV.decimals);
}

function normalizeVesuDecimal(value: string, decimals: number): bigint {
  const raw = BigInt(value);
  if (decimals === 18) {
    return raw;
  }
  if (decimals > 18) {
    return raw / 10n ** BigInt(decimals - 18);
  }
  return raw * 10n ** BigInt(18 - decimals);
}

function ceilDiv(dividend: bigint, divisor: bigint): bigint {
  return (dividend + divisor - 1n) / divisor;
}

function getVesuCloseRepayBuffer(decimals: number): bigint {
  if (decimals <= VESU_CLOSE_REPAY_BUFFER_DECIMALS) {
    return 1n;
  }

  return 10n ** BigInt(decimals - VESU_CLOSE_REPAY_BUFFER_DECIMALS);
}

function symbolPriority(symbol: string, order: readonly string[]): number {
  const index = order.indexOf(symbol);
  return index === -1 ? order.length : index;
}

const ASSET_PRIORITY_ORDER = [
  ...new Set([
    ...DEFAULT_VESU_DEBT_SYMBOLS,
    ...DEFAULT_VESU_VAULT_SYMBOLS,
    ...DEFAULT_VESU_COLLATERAL_SYMBOLS,
  ]),
];

function getAssetPriority(symbol: string): number {
  return symbolPriority(symbol, ASSET_PRIORITY_ORDER);
}

function getCollateralPriority(symbol: string): number {
  return symbolPriority(symbol, DEFAULT_VESU_COLLATERAL_SYMBOLS);
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
