import {
  Amount,
  type LendingMarket,
  type LendingUserPosition,
  type Token,
} from "starkzap";

interface VesuApiDecimalValue {
  decimals: number;
  value: string;
}

interface VesuPoolAssetConfig {
  debtFloor?: VesuApiDecimalValue;
}

interface VesuPoolAsset {
  address: string;
  symbol: string;
  decimals: number;
  usdPrice?: VesuApiDecimalValue;
  config?: VesuPoolAssetConfig;
}

interface VesuPoolPair {
  collateralAssetAddress: string;
  debtAssetAddress: string;
  maxLTV?: VesuApiDecimalValue;
}

export interface WebVesuPoolData {
  id: string;
  name?: string | null;
  assets: VesuPoolAsset[];
  pairs: VesuPoolPair[];
}

export interface WebVesuMarketLike {
  poolAddress?: LendingMarket["poolAddress"];
  poolName?: string;
  asset: Token;
  canBeBorrowed?: boolean;
  stats?: LendingMarket["stats"];
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
const VESU_POOL_API_BASE = "https://api.vesu.xyz/pools";
const VESU_POOL_REQUEST_TIMEOUT_MS = 8_000;
const VESU_HEALTH_VALUE_SCALE = 10n ** 18n;
const VESU_BASIS_POINTS_SCALE = 10_000n;
const VESU_MAX_BORROW_SAFETY_BPS = 9_900n;
const VESU_CLOSE_REPAY_BUFFER_DECIMALS = 5;
export const WEB_VESU_PERCENT_SCALE = 10_000n;

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
    if (sameAddress(market.asset.address, selected.market.asset.address)) {
      continue;
    }
    if (!debtMarkets.has(market.asset.address)) {
      debtMarkets.set(market.asset.address, market);
    }
  }

  return buildWebVesuMarketOptions([...debtMarkets.values()]);
}

export function buildFallbackWebVesuMarkets(
  tokens: Token[]
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

export async function fetchWebVesuPoolData(
  poolAddress: string
): Promise<WebVesuPoolData | null> {
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
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: WebVesuPoolData };
    return payload.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getWebVesuBorrowCapacityForDeposit(params: {
  pool: WebVesuPoolData | null | undefined;
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

export function getWebVesuMinimumDepositForBorrow(params: {
  pool: WebVesuPoolData | null | undefined;
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

export function getWebVesuCloseRepayAmount(params: {
  debtAmount?: bigint | null;
  debtToken: Token;
}): bigint | null {
  const debtAmount = params.debtAmount ?? 0n;
  if (debtAmount <= 0n) {
    return null;
  }

  return debtAmount + getWebVesuCloseRepayBuffer(params.debtToken.decimals);
}

export function getWebVesuRepaySubmissionAmount(params: {
  debtToken: Token;
  debtAmount?: Amount | null;
  collateralAmount?: Amount | null;
  currentDebtAmount?: bigint | null;
  walletDebtBalance?: bigint | null;
}): Amount | null {
  const requestedDebtAmount = params.debtAmount;
  if (requestedDebtAmount) {
    const currentDebtAmount = params.currentDebtAmount ?? 0n;
    const closeRepayAmount = getWebVesuCloseRepayAmount({
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

export function getWebVesuUserPositionForMarket(params: {
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

export function getWebVesuBorrowPosition(params: {
  userPositions: LendingUserPosition[];
  collateralToken: Token;
  debtToken: Token;
  poolAddress?: LendingMarket["poolAddress"];
}): LendingUserPosition | null {
  return (
    params.userPositions.find(
      (position) =>
        position.type === "borrow" &&
        sameAddress(
          position.collateral.token.address,
          params.collateralToken.address
        ) &&
        sameAddress(position.debt?.token.address, params.debtToken.address) &&
        (!params.poolAddress ||
          sameAddress(position.pool.id, params.poolAddress))
    ) ?? null
  );
}

export function getWebVesuPositionBadgeLabel(
  position: LendingUserPosition
): string {
  if (position.type === "borrow") {
    return position.debt
      ? `Borrowing ${Amount.fromRaw(position.debt.amount, position.debt.token).toUnit()} ${position.debt.token.symbol}`
      : "Borrow position open";
  }

  return `${Amount.fromRaw(position.collateral.amount, position.collateral.token).toUnit()} ${position.collateral.token.symbol} deposited`;
}

export function parseWebVesuPercentInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }

  const [integerPart, fractionPart = ""] = trimmed.split(".");
  const basisPoints =
    BigInt(integerPart || "0") * 100n +
    BigInt((fractionPart + "00").slice(0, 2));
  return basisPoints <= WEB_VESU_PERCENT_SCALE ? basisPoints : null;
}

export function formatWebVesuPercentInput(value: bigint): string {
  const clamped =
    value < 0n
      ? 0n
      : value > WEB_VESU_PERCENT_SCALE
        ? WEB_VESU_PERCENT_SCALE
        : value;
  const integer = clamped / 100n;
  const fraction = clamped % 100n;
  return fraction === 0n
    ? integer.toString()
    : `${integer.toString()}.${fraction.toString().padStart(2, "0")}`.replace(
        /0+$/,
        ""
      );
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

function getPoolAssetUsdPrice(
  pool: WebVesuPoolData | null | undefined,
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
  pool: WebVesuPoolData | null | undefined,
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

function getWebVesuCloseRepayBuffer(decimals: number): bigint {
  if (decimals <= VESU_CLOSE_REPAY_BUFFER_DECIMALS) {
    return 1n;
  }

  return 10n ** BigInt(decimals - VESU_CLOSE_REPAY_BUFFER_DECIMALS);
}

function sameAddress(left?: string | null, right?: string | null): boolean {
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}
