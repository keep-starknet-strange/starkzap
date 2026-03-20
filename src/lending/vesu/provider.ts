import type {
  LendingActionInput,
  LendingAmountDenomination,
  LendingBorrowRequest,
  LendingDepositRequest,
  LendingHealth,
  LendingHealthQuoteRequest,
  LendingHealthRequest,
  LendingMarket,
  LendingMarketStats,
  LendingPosition,
  LendingPositionRequest,
  LendingProvider,
  LendingProviderContext,
  LendingRepayRequest,
  LendingMaxBorrowRequest,
  LendingUserPosition,
  LendingUserPositionsRequest,
  LendingWithdrawMaxRequest,
  LendingWithdrawRequest,
  PreparedLendingAction,
} from "@/lending/interface";
import {
  Amount,
  type Address,
  type ChainId,
  fromAddress,
  type Token,
} from "@/types";
import { CallData, type Call, uint256 } from "starknet";
import { vesuPresets, type VesuChainConfig } from "@/lending/vesu/presets";

type VesuChain = "SN_MAIN" | "SN_SEPOLIA";
const VESU_SCALE = 10n ** 18n;
const BASIS_POINTS_SCALE = 10_000n;
const MAX_BORROW_SAFETY_BPS = 9_900n;

interface VesuApiDecimalValue {
  value?: string;
  decimals?: number;
}

interface VesuMarketApiItem {
  protocolVersion?: string;
  pool?: { id?: string; name?: string; isDeprecated?: boolean };
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  vToken?: {
    address?: string;
    symbol?: string;
  };
  stats?: {
    canBeBorrowed?: boolean;
    supplyApy?: VesuApiDecimalValue | null;
    borrowApr?: VesuApiDecimalValue | null;
    totalSupplied?: VesuApiDecimalValue | null;
    totalDebt?: VesuApiDecimalValue | null;
    currentUtilization?: VesuApiDecimalValue | null;
  };
}

interface VesuMarketsResponse {
  data?: VesuMarketApiItem[];
}

interface VesuPositionApiTokenInfo {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  value?: string;
  usdPrice?: { value?: string; decimals?: number };
}

interface VesuPositionApiItem {
  protocolVersion?: string;
  pool?: { id?: string; name?: string };
  type?: string;
  isDeprecated?: boolean;
  walletAddress?: string;
  collateral?: VesuPositionApiTokenInfo;
  collateralShares?: VesuPositionApiTokenInfo;
  debt?: VesuPositionApiTokenInfo;
}

interface VesuPositionsResponse {
  data?: VesuPositionApiItem[];
}

export interface VesuLendingProviderOptions {
  fetcher?: typeof fetch;
  chainConfigs?: Partial<
    Record<
      VesuChain,
      {
        poolFactory?: Address | string | null;
        defaultPool?: Address | string | null;
        marketsApiUrl?: string | null;
        positionsApiUrl?: string | null;
      }
    >
  >;
}

export class VesuLendingProvider implements LendingProvider {
  readonly id = "vesu";

  private readonly fetcher: typeof fetch;
  private readonly chainConfigs: Partial<Record<VesuChain, VesuChainConfig>>;
  private readonly vTokenCache = new Map<string, Promise<Address>>();

  constructor(options: VesuLendingProviderOptions = {}) {
    if (options.fetcher) {
      this.fetcher = options.fetcher;
    } else if (typeof globalThis.fetch === "function") {
      this.fetcher = globalThis.fetch.bind(globalThis) as typeof fetch;
    } else {
      throw new Error(
        "No fetch implementation available. Provide fetcher in VesuLendingProvider."
      );
    }

    const chainConfigs: Partial<Record<VesuChain, VesuChainConfig>> = {};
    for (const chain of ["SN_MAIN", "SN_SEPOLIA"] as const) {
      const base: VesuChainConfig = vesuPresets[chain];
      const ovr = options.chainConfigs?.[chain];
      if (!base && !ovr) continue;

      // For each field: explicit `null` in override clears it,
      // `undefined` falls back to base, anything else is used as-is.
      const pick = <T>(
        o: T | null | undefined,
        b: T | undefined
      ): T | undefined => (o === null ? undefined : o !== undefined ? o : b);

      const merged: VesuChainConfig = {};
      const pool = pick(ovr?.poolFactory, base?.poolFactory);
      if (pool != null) merged.poolFactory = fromAddress(pool);
      const defPool = pick(ovr?.defaultPool, base?.defaultPool);
      if (defPool != null) merged.defaultPool = fromAddress(defPool);
      const markets = pick(ovr?.marketsApiUrl, base?.marketsApiUrl);
      if (markets != null) merged.marketsApiUrl = markets;
      const positions = pick(ovr?.positionsApiUrl, base?.positionsApiUrl);
      if (positions != null) merged.positionsApiUrl = positions;

      chainConfigs[chain] = merged;
    }
    this.chainConfigs = chainConfigs;
  }

  supportsChain(chainId: ChainId): boolean {
    return this.getChainConfig(chainId) != null;
  }

  async getMarkets(chainId: ChainId): Promise<LendingMarket[]> {
    const config = this.requireChainConfig(chainId);
    if (!config.marketsApiUrl) {
      return [];
    }

    const response = await this.fetcher(config.marketsApiUrl);
    if (!response.ok) {
      throw new Error(`Vesu markets request failed (${response.status})`);
    }
    const payload = (await response.json()) as VesuMarketsResponse;

    return (payload.data ?? [])
      .filter((entry) => this.isSupportedMarket(entry))
      .map((entry) => this.toMarket(entry))
      .filter((market): market is LendingMarket => market != null);
  }

  async prepareDeposit(
    context: LendingProviderContext,
    request: LendingDepositRequest
  ): Promise<PreparedLendingAction> {
    const { poolAddress, receiver, vTokenAddress } =
      await this.resolveVaultContext(context, request);
    const amount = request.amount.toBase();

    return {
      providerId: this.id,
      action: "deposit",
      calls: [
        this.buildApproveCall(request.token.address, vTokenAddress, amount),
        {
          contractAddress: vTokenAddress,
          entrypoint: "deposit",
          calldata: CallData.compile([uint256.bnToUint256(amount), receiver]),
        },
      ],
      market: this.marketFromRequest({
        poolAddress,
        token: request.token,
        vTokenAddress,
      }),
    };
  }

  async prepareWithdraw(
    context: LendingProviderContext,
    request: LendingWithdrawRequest
  ): Promise<PreparedLendingAction> {
    const { poolAddress, receiver, owner, vTokenAddress } =
      await this.resolveVaultContext(context, request, {
        requireSelfOwner: true,
      });
    const amount = request.amount.toBase();

    return {
      providerId: this.id,
      action: "withdraw",
      calls: [
        {
          contractAddress: vTokenAddress,
          entrypoint: "withdraw",
          calldata: CallData.compile([
            uint256.bnToUint256(amount),
            receiver,
            owner,
          ]),
        },
      ],
      market: this.marketFromRequest({
        poolAddress,
        token: request.token,
        vTokenAddress,
      }),
    };
  }

  async prepareWithdrawMax(
    context: LendingProviderContext,
    request: LendingWithdrawMaxRequest
  ): Promise<PreparedLendingAction> {
    const { poolAddress, receiver, owner, vTokenAddress } =
      await this.resolveVaultContext(context, request, {
        requireSelfOwner: true,
      });

    const maxRedeemResult = await context.provider.callContract({
      contractAddress: vTokenAddress,
      entrypoint: "max_redeem",
      calldata: CallData.compile([owner]),
    });
    const maxShares = parseU256(maxRedeemResult, 0, "max_redeem");
    if (maxShares <= 0n) {
      throw new Error("No withdrawable Vesu shares for this position");
    }

    return {
      providerId: this.id,
      action: "withdraw",
      calls: [
        {
          contractAddress: vTokenAddress,
          entrypoint: "redeem",
          calldata: CallData.compile([
            uint256.bnToUint256(maxShares),
            receiver,
            owner,
          ]),
        },
      ],
      market: this.marketFromRequest({
        poolAddress,
        token: request.token,
        vTokenAddress,
      }),
    };
  }

  async prepareBorrow(
    context: LendingProviderContext,
    request: LendingBorrowRequest
  ): Promise<PreparedLendingAction> {
    const { poolAddress, user } = this.resolveWritablePositionContext(
      context,
      request,
      "borrow"
    );
    const debtAmount = request.amount.toBase();
    const debtDenomination = request.debtDenomination ?? "assets";

    assertAssetsDenomination("borrow", "debt", debtDenomination);

    let collateralAmount = request.collateralAmount?.toBase() ?? 0n;
    const collateralDenomination = request.collateralDenomination ?? "assets";
    assertAssetsDenomination("borrow", "collateral", collateralDenomination);

    const earnCalls = request.useEarnPosition
      ? await this.buildEarnRedemptionCalls(
          context,
          poolAddress,
          request.collateralToken,
          user
        )
      : null;

    if (earnCalls) {
      collateralAmount = collateralAmount + earnCalls.earnBalance;
    }

    const calls: Call[] = [...(earnCalls?.calls ?? [])];

    if (collateralAmount > 0n && collateralDenomination === "assets") {
      calls.push(
        this.buildApproveCall(
          request.collateralToken.address,
          poolAddress,
          collateralAmount
        )
      );
    }

    calls.push(
      this.buildModifyPositionCall({
        poolAddress,
        collateralAsset: request.collateralToken.address,
        debtAsset: request.debtToken.address,
        user,
        collateral: {
          denomination: collateralDenomination,
          value: collateralAmount,
        },
        debt: { denomination: debtDenomination, value: debtAmount },
      })
    );

    return {
      providerId: this.id,
      action: "borrow",
      calls,
    };
  }

  async prepareRepay(
    context: LendingProviderContext,
    request: LendingRepayRequest
  ): Promise<PreparedLendingAction> {
    const { poolAddress, user } = this.resolveWritablePositionContext(
      context,
      request,
      "repay"
    );
    const collateralAmount = request.collateralAmount?.toBase() ?? 0n;
    const collateralDenomination = request.collateralDenomination ?? "assets";
    const withdrawCollateral = request.withdrawCollateral ?? false;
    const debtAmount = request.amount.toBase();
    const debtDenomination = request.debtDenomination ?? "assets";

    assertAssetsDenomination("repay", "collateral", collateralDenomination);
    assertAssetsDenomination("repay", "debt", debtDenomination);

    const calls: Call[] = [];
    if (debtAmount > 0n) {
      calls.push(
        this.buildApproveCall(
          request.debtToken.address,
          poolAddress,
          debtAmount
        )
      );
    }

    const collateralDelta = withdrawCollateral
      ? -collateralAmount
      : collateralAmount;
    if (
      !withdrawCollateral &&
      collateralAmount > 0n &&
      collateralDenomination === "assets"
    ) {
      calls.push(
        this.buildApproveCall(
          request.collateralToken.address,
          poolAddress,
          collateralAmount
        )
      );
    }

    calls.push(
      this.buildModifyPositionCall({
        poolAddress,
        collateralAsset: request.collateralToken.address,
        debtAsset: request.debtToken.address,
        user,
        collateral: {
          denomination: collateralDenomination,
          value: collateralDelta,
        },
        debt: { denomination: debtDenomination, value: -debtAmount },
      })
    );

    return {
      providerId: this.id,
      action: "repay",
      calls,
    };
  }

  async getPosition(
    context: LendingProviderContext,
    request: LendingPositionRequest
  ): Promise<LendingPosition> {
    const { poolAddress, user } = this.resolveRequestContext(context, request);

    const positionResult = await context.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: "position",
      calldata: CallData.compile([
        request.collateralToken.address,
        request.debtToken.address,
        user,
      ]),
    });

    const health = await this.getHealth(context, {
      ...request,
      poolAddress,
      user,
    });

    return {
      collateralShares: parseU256(positionResult, 0, "collateral_shares"),
      nominalDebt: parseU256(positionResult, 2, "nominal_debt"),
      collateralAmount: parseU256(positionResult, 4, "collateral_amount"),
      debtAmount: parseU256(positionResult, 6, "debt_amount"),
      collateralValue: health.collateralValue,
      debtValue: health.debtValue,
      isCollateralized: health.isCollateralized,
    };
  }

  async getHealth(
    context: LendingProviderContext,
    request: LendingHealthRequest
  ): Promise<LendingHealth> {
    const { poolAddress, user } = this.resolveRequestContext(context, request);

    const result = await context.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: "check_collateralization",
      calldata: CallData.compile([
        request.collateralToken.address,
        request.debtToken.address,
        user,
      ]),
    });

    return {
      isCollateralized: parseBool(result[0], "isCollateralized"),
      collateralValue: parseU256(result, 1, "collateral_value"),
      debtValue: parseU256(result, 3, "debt_value"),
    };
  }

  async quoteProjectedHealth(
    context: LendingProviderContext,
    request: LendingHealthQuoteRequest,
    current: LendingHealth
  ): Promise<LendingHealth | null> {
    if (
      request.action.action !== "borrow" &&
      request.action.action !== "repay"
    ) {
      return null;
    }

    const actionRequest = request.action.request;
    const healthRequest = request.health;
    const actionContext = this.resolveRequestContext(context, actionRequest);
    const healthContext = this.resolveRequestContext(context, healthRequest);

    if (
      actionContext.poolAddress !== healthContext.poolAddress ||
      actionContext.user !== healthContext.user ||
      actionRequest.collateralToken.address !==
        healthRequest.collateralToken.address ||
      actionRequest.debtToken.address !== healthRequest.debtToken.address
    ) {
      return null;
    }

    const collateralDenomination =
      actionRequest.collateralDenomination ?? "assets";
    const debtDenomination = actionRequest.debtDenomination ?? "assets";
    if (collateralDenomination !== "assets" || debtDenomination !== "assets") {
      return null;
    }

    const { collateralDelta, debtDelta } = await this.computeHealthQuoteDeltas(
      context,
      request.action,
      actionContext
    );

    return this.projectHealth(
      context,
      actionContext,
      actionRequest,
      current,
      collateralDelta,
      debtDelta
    );
  }

  /**
   * Compute the collateral and debt deltas for a projected health quote.
   * Only supports "borrow" and "repay" actions.
   */
  private async computeHealthQuoteDeltas(
    context: LendingProviderContext,
    action: LendingActionInput,
    actionContext: { poolAddress: Address; user: Address }
  ): Promise<{ collateralDelta: bigint; debtDelta: bigint }> {
    if (action.action === "repay") {
      const collateralAmount = action.request.collateralAmount?.toBase() ?? 0n;
      const collateralDelta = action.request.withdrawCollateral
        ? -collateralAmount
        : collateralAmount;
      return {
        collateralDelta,
        debtDelta: -action.request.amount.toBase(),
      };
    }

    if (action.action === "borrow") {
      let collateralDelta = action.request.collateralAmount?.toBase() ?? 0n;
      if (action.request.useEarnPosition) {
        collateralDelta += await this.readEarnBalance(
          context,
          actionContext.poolAddress,
          action.request.collateralToken,
          actionContext.user
        );
      }
      return {
        collateralDelta,
        debtDelta: action.request.amount.toBase(),
      };
    }

    return { collateralDelta: 0n, debtDelta: 0n };
  }

  /**
   * Given deltas and current health, resolve on-chain prices and compute
   * projected health values.
   */
  private async projectHealth(
    context: LendingProviderContext,
    actionContext: { poolAddress: Address; user: Address },
    actionRequest: { collateralToken: Token; debtToken: Token },
    current: LendingHealth,
    collateralDelta: bigint,
    debtDelta: bigint
  ): Promise<LendingHealth | null> {
    const [collateralPrice, debtPrice, maxLtv] = await Promise.all([
      this.readAssetPrice(
        context,
        actionContext.poolAddress,
        actionRequest.collateralToken.address
      ),
      this.readAssetPrice(
        context,
        actionContext.poolAddress,
        actionRequest.debtToken.address
      ),
      this.readPairMaxLtv(
        context,
        actionContext.poolAddress,
        actionRequest.collateralToken.address,
        actionRequest.debtToken.address
      ),
    ]);
    if (!collateralPrice.isValid || !debtPrice.isValid) {
      return null;
    }

    const collateralDeltaValue = amountToValueDelta(
      collateralDelta,
      collateralPrice.value,
      tokenScale(actionRequest.collateralToken.decimals),
      roundingForDelta(collateralDelta, "floor")
    );
    const debtDeltaValue = amountToValueDelta(
      debtDelta,
      debtPrice.value,
      tokenScale(actionRequest.debtToken.decimals),
      roundingForDelta(debtDelta, "ceil")
    );
    const collateralValue = clampNonNegative(
      current.collateralValue + collateralDeltaValue
    );
    const debtValue = clampNonNegative(current.debtValue + debtDeltaValue);

    return {
      isCollateralized: collateralValue * maxLtv >= debtValue * VESU_SCALE,
      collateralValue,
      debtValue,
    };
  }

  async getPositions(
    context: LendingProviderContext,
    request: LendingUserPositionsRequest
  ): Promise<LendingUserPosition[]> {
    const config = this.requireChainConfig(context.chainId);
    if (!config.positionsApiUrl) {
      return [];
    }

    const user = request.user ?? context.walletAddress;
    const url = `${config.positionsApiUrl}?walletAddress=${user}`;
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`Vesu positions request failed (${response.status})`);
    }
    const payload = (await response.json()) as VesuPositionsResponse;
    const positions: LendingUserPosition[] = [];
    for (const entry of payload.data ?? []) {
      if (
        entry.protocolVersion?.toLowerCase() !== "v2" ||
        entry.isDeprecated === true
      ) {
        continue;
      }

      const position = this.toUserPosition(entry);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  /**
   * Parse a single API position entry into a domain object.
   * Returns `null` for entries with missing/invalid fields rather than throwing,
   * so a single malformed entry does not break the entire positions response.
   */
  private toUserPosition(
    entry: VesuPositionApiItem
  ): LendingUserPosition | null {
    try {
      return this.parseUserPosition(entry);
    } catch {
      return null;
    }
  }

  private parseUserPosition(
    entry: VesuPositionApiItem
  ): LendingUserPosition | null {
    const collateral = entry.collateral;
    if (
      !entry.pool?.id ||
      !entry.type ||
      !collateral?.address ||
      !collateral.symbol ||
      collateral.decimals == null ||
      !collateral.value
    ) {
      return null;
    }

    const posType =
      entry.type === "earn" || entry.type === "borrow" ? entry.type : null;
    if (!posType) return null;

    const collateralToken: Token = {
      address: fromAddress(collateral.address),
      symbol: collateral.symbol,
      decimals: collateral.decimals,
      name: collateral.name ?? collateral.symbol,
    };
    const collateralUsdValue = toPositionUsdValue(collateral);

    const collateralAmountRaw = BigInt(collateral.value);

    const result: LendingUserPosition = {
      type: posType,
      pool: {
        id: fromAddress(entry.pool.id),
        ...(entry.pool.name ? { name: entry.pool.name } : {}),
      },
      collateral: {
        token: collateralToken,
        amount: collateralAmountRaw,
        ...(collateralUsdValue != null ? { usdValue: collateralUsdValue } : {}),
      },
    };

    const shares = entry.collateralShares;
    if (
      shares?.address &&
      shares.symbol &&
      shares.decimals != null &&
      shares.value
    ) {
      result.collateralShares = {
        token: {
          address: fromAddress(shares.address),
          symbol: shares.symbol,
          decimals: shares.decimals,
          name: shares.name ?? shares.symbol,
        },
        amount: BigInt(shares.value),
      };
    }

    const debt = entry.debt;
    let debtAmountRaw = 0n;
    if (debt?.address && debt.symbol && debt.decimals != null && debt.value) {
      debtAmountRaw = BigInt(debt.value);
      const debtUsdValue = toPositionUsdValue(debt);
      result.debt = {
        token: {
          address: fromAddress(debt.address),
          symbol: debt.symbol,
          decimals: debt.decimals,
          name: debt.name ?? debt.symbol,
        },
        amount: debtAmountRaw,
        ...(debtUsdValue != null ? { usdValue: debtUsdValue } : {}),
      };
    }

    // Skip fully closed positions (zero collateral and zero debt)
    if (collateralAmountRaw === 0n && debtAmountRaw === 0n) {
      return null;
    }

    return result;
  }

  async getMaxBorrowAmount(
    context: LendingProviderContext,
    request: LendingMaxBorrowRequest
  ): Promise<bigint> {
    const { poolAddress, user } = this.resolveRequestContext(context, request);

    const [health, earnBalance, collateralPrice, debtPrice, maxLtv] =
      await Promise.all([
        this.getHealth(context, {
          collateralToken: request.collateralToken,
          debtToken: request.debtToken,
          poolAddress,
          user,
        }),
        request.useEarnPosition
          ? this.readEarnBalance(
              context,
              poolAddress,
              request.collateralToken,
              user
            )
          : Promise.resolve(0n),
        this.readAssetPrice(
          context,
          poolAddress,
          request.collateralToken.address
        ),
        this.readAssetPrice(context, poolAddress, request.debtToken.address),
        this.readPairMaxLtv(
          context,
          poolAddress,
          request.collateralToken.address,
          request.debtToken.address
        ),
      ]);

    if (!collateralPrice.isValid || !debtPrice.isValid) {
      return 0n;
    }
    if (debtPrice.value === 0n) {
      return 0n;
    }

    // Total collateral = on-chain borrow position collateral + earn deposit
    const collateralScale = tokenScale(request.collateralToken.decimals);
    const earnCollateralValue =
      earnBalance > 0n
        ? (earnBalance * collateralPrice.value) / collateralScale
        : 0n;
    const totalCollateralValue = health.collateralValue + earnCollateralValue;

    // maxBorrowValue = totalCollateralValue * maxLtv / SCALE - debtValue
    const maxBorrowValue =
      (totalCollateralValue * maxLtv) / VESU_SCALE - health.debtValue;

    if (maxBorrowValue <= 0n) {
      return 0n;
    }

    // Convert value back to debt token amount: amount = value * tokenScale / price
    const debtScale = tokenScale(request.debtToken.decimals);
    const maxBorrowAmount = (maxBorrowValue * debtScale) / debtPrice.value;

    // Apply a 1% safety margin to avoid surfacing a "max" value that
    // rounds above what the on-chain collateralization check will accept.
    return (maxBorrowAmount * MAX_BORROW_SAFETY_BPS) / BASIS_POINTS_SCALE;
  }

  /**
   * Build calls to redeem a user's entire earn position (vToken → underlying)
   * so the proceeds can be used as collateral in a borrow.
   */
  private async buildEarnRedemptionCalls(
    context: LendingProviderContext,
    poolAddress: Address,
    collateralToken: Token,
    user: Address
  ): Promise<{ calls: Call[]; earnBalance: bigint } | null> {
    const earnBalance = await this.readEarnBalance(
      context,
      poolAddress,
      collateralToken,
      user
    );
    if (earnBalance === 0n) {
      return null;
    }

    const vTokenAddress = await this.resolveVTokenAddress(
      context,
      poolAddress,
      collateralToken.address
    );
    const balanceResult = await context.provider.callContract({
      contractAddress: vTokenAddress,
      entrypoint: "balance_of",
      calldata: CallData.compile([user]),
    });
    const shares = parseU256(balanceResult, 0, "vtoken_balance");
    if (shares === 0n) {
      return null;
    }

    return {
      calls: [
        {
          contractAddress: vTokenAddress,
          entrypoint: "redeem",
          calldata: CallData.compile([uint256.bnToUint256(shares), user, user]),
        },
      ],
      earnBalance,
    };
  }

  /**
   * Read a user's earn position balance (underlying assets) from the vToken.
   * Returns the amount in the collateral token's base units.
   */
  private async readEarnBalance(
    context: LendingProviderContext,
    poolAddress: Address,
    collateralToken: Token,
    user: Address
  ): Promise<bigint> {
    const vTokenAddress = await this.resolveVTokenAddress(
      context,
      poolAddress,
      collateralToken.address
    );

    // Zero shares is a valid "no earn position" result; other read failures
    // must propagate so useEarnPosition calls do not silently degrade.
    const balanceResult = await context.provider.callContract({
      contractAddress: vTokenAddress,
      entrypoint: "balance_of",
      calldata: CallData.compile([user]),
    });
    const shares = parseU256(balanceResult, 0, "vtoken_balance");
    if (shares === 0n) {
      return 0n;
    }

    const assetsResult = await context.provider.callContract({
      contractAddress: vTokenAddress,
      entrypoint: "convert_to_assets",
      calldata: CallData.compile([uint256.bnToUint256(shares)]),
    });
    return parseU256(assetsResult, 0, "vtoken_assets");
  }

  private async readAssetPrice(
    context: LendingProviderContext,
    poolAddress: Address,
    assetAddress: Address
  ): Promise<{ value: bigint; isValid: boolean }> {
    const result = await context.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: "price",
      calldata: CallData.compile([assetAddress]),
    });
    return {
      value: parseU256(result, 0, "asset_price"),
      isValid: parseBool(result[2], "asset_price_is_valid"),
    };
  }

  private async readPairMaxLtv(
    context: LendingProviderContext,
    poolAddress: Address,
    collateralAsset: Address,
    debtAsset: Address
  ): Promise<bigint> {
    const result = await context.provider.callContract({
      contractAddress: poolAddress,
      entrypoint: "pair_config",
      calldata: CallData.compile([collateralAsset, debtAsset]),
    });
    const maxLtv = result[0];
    if (maxLtv == null) {
      throw new Error('Missing felt value for "max_ltv"');
    }
    return BigInt(String(maxLtv));
  }

  private buildApproveCall(
    tokenAddress: Address,
    spender: Address,
    amount: bigint
  ): Call {
    return {
      contractAddress: tokenAddress,
      entrypoint: "approve",
      calldata: CallData.compile([spender, uint256.bnToUint256(amount)]),
    };
  }

  private buildModifyPositionCall(args: {
    poolAddress: Address;
    collateralAsset: Address;
    debtAsset: Address;
    user: Address;
    collateral: { denomination: LendingAmountDenomination; value: bigint };
    debt: { denomination: LendingAmountDenomination; value: bigint };
  }): Call {
    return {
      contractAddress: args.poolAddress,
      entrypoint: "modify_position",
      calldata: CallData.compile([
        args.collateralAsset,
        args.debtAsset,
        args.user,
        ...encodeAmount(args.collateral.value, args.collateral.denomination),
        ...encodeAmount(args.debt.value, args.debt.denomination),
      ]),
    };
  }

  private marketFromRequest(args: {
    poolAddress: Address;
    token: Token;
    vTokenAddress: Address;
  }): LendingMarket {
    return {
      protocol: this.id,
      poolAddress: args.poolAddress,
      asset: args.token,
      vTokenAddress: args.vTokenAddress,
    };
  }

  private resolveVTokenAddress(
    context: LendingProviderContext,
    poolAddress: Address,
    assetAddress: Address
  ): Promise<Address> {
    const key = `${context.chainId.toLiteral()}:${poolAddress}:${assetAddress}`;
    const cached = this.vTokenCache.get(key);
    if (cached) {
      return cached;
    }

    const poolFactory = this.requireChainConfig(context.chainId).poolFactory;
    if (!poolFactory) {
      throw new Error(
        `Vesu chain "${context.chainId.toLiteral()}" has no poolFactory configured. Required for deposit/withdraw vToken resolution.`
      );
    }
    const promise = (async () => {
      const result = await context.provider.callContract({
        contractAddress: poolFactory,
        entrypoint: "v_token_for_asset",
        calldata: CallData.compile([poolAddress, assetAddress]),
      });
      const candidate = result[0];
      if (candidate == null || BigInt(String(candidate)) === 0n) {
        throw new Error("Unable to resolve Vesu vToken for asset");
      }
      return fromAddress(candidate);
    })();
    this.vTokenCache.set(key, promise);
    // Evict from cache on failure so subsequent calls can retry.
    promise.catch(() => this.vTokenCache.delete(key));
    return promise;
  }

  private async resolveVaultContext<
    T extends {
      poolAddress?: Address;
      token: Token;
      receiver?: Address;
      owner?: Address;
    },
  >(
    context: LendingProviderContext,
    request: T,
    options?: { requireSelfOwner?: boolean }
  ): Promise<{
    poolAddress: Address;
    receiver: Address;
    owner: Address;
    vTokenAddress: Address;
  }> {
    const owner = request.owner ?? context.walletAddress;
    if (options?.requireSelfOwner && owner !== context.walletAddress) {
      throw new Error(
        "Vesu delegated withdrawals are not yet supported; owner must match wallet address"
      );
    }
    const poolAddress = this.resolvePoolAddress(
      request.poolAddress,
      this.requireChainConfig(context.chainId)
    );
    return {
      poolAddress,
      receiver: request.receiver ?? context.walletAddress,
      owner,
      vTokenAddress: await this.resolveVTokenAddress(
        context,
        poolAddress,
        request.token.address
      ),
    };
  }

  private resolveWritablePositionContext<
    T extends { poolAddress?: Address; user?: Address },
  >(
    context: LendingProviderContext,
    request: T,
    action: "borrow" | "repay"
  ): { poolAddress: Address; user: Address } {
    const resolved = this.resolveRequestContext(context, request);
    if (resolved.user !== context.walletAddress) {
      throw new Error(
        `Vesu delegated ${action} is not yet supported; user must match wallet address`
      );
    }
    return resolved;
  }

  private resolveRequestContext<
    T extends { poolAddress?: Address; user?: Address },
  >(
    context: LendingProviderContext,
    request: T
  ): { poolAddress: Address; user: Address } {
    const config = this.requireChainConfig(context.chainId);
    return {
      poolAddress: this.resolvePoolAddress(request.poolAddress, config),
      user: request.user ?? context.walletAddress,
    };
  }

  private resolvePoolAddress(
    poolAddress: Address | undefined,
    config: VesuChainConfig
  ): Address {
    if (poolAddress) {
      return poolAddress;
    }
    if (config.defaultPool) {
      return config.defaultPool;
    }
    throw new Error(
      `No Vesu poolAddress provided and no default pool configured for provider "${this.id}"`
    );
  }

  private getChainConfig(chainId: ChainId): VesuChainConfig | undefined {
    return this.chainConfigs[chainId.toLiteral() as VesuChain];
  }

  private requireChainConfig(chainId: ChainId): VesuChainConfig {
    const config = this.getChainConfig(chainId);
    if (!config) {
      throw new Error(
        `Vesu provider does not support chain "${chainId.toLiteral()}". Configure chainConfigs to enable it.`
      );
    }
    return config;
  }

  private isSupportedMarket(entry: VesuMarketApiItem): boolean {
    const protocolVersion = entry.protocolVersion?.toLowerCase();
    if (protocolVersion && protocolVersion !== "v2") {
      return false;
    }
    return entry.pool?.isDeprecated !== true;
  }

  private toMarket(entry: VesuMarketApiItem): LendingMarket | null {
    if (
      !entry.pool?.id ||
      !entry.address ||
      !entry.symbol ||
      entry.decimals == null ||
      !entry.name ||
      !entry.vToken?.address
    ) {
      return null;
    }

    const market: LendingMarket = {
      protocol: this.id,
      poolAddress: fromAddress(entry.pool.id),
      asset: {
        address: fromAddress(entry.address),
        symbol: entry.symbol,
        decimals: entry.decimals,
        name: entry.name,
      },
      vTokenAddress: fromAddress(entry.vToken.address),
    };
    if (entry.pool.name) market.poolName = entry.pool.name;
    if (entry.vToken.symbol) market.vTokenSymbol = entry.vToken.symbol;
    if (entry.stats?.canBeBorrowed != null)
      market.canBeBorrowed = entry.stats.canBeBorrowed;

    if (entry.stats) {
      const stats = toMarketStats(entry.stats);
      if (stats) market.stats = stats;
    }

    return market;
  }
}

function toMarketStats(
  s: NonNullable<VesuMarketApiItem["stats"]>
): LendingMarketStats | undefined {
  const stats: LendingMarketStats = {};
  const supplyApy = toAmount(s.supplyApy);
  if (supplyApy) stats.supplyApy = supplyApy;
  const borrowApr = toAmount(s.borrowApr);
  if (borrowApr) stats.borrowApr = borrowApr;
  const totalSupplied = toAmount(s.totalSupplied);
  if (totalSupplied) stats.totalSupplied = totalSupplied;
  const totalBorrowed = toAmount(s.totalDebt);
  if (totalBorrowed) stats.totalBorrowed = totalBorrowed;
  const utilization = toAmount(s.currentUtilization);
  if (utilization) stats.utilization = utilization;
  return Object.keys(stats).length > 0 ? stats : undefined;
}

function toAmount(
  v: VesuApiDecimalValue | null | undefined
): Amount | undefined {
  if (!v?.value || v.decimals == null) return undefined;
  return Amount.fromRaw(v.value, v.decimals);
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

function toPositionUsdValue(
  token: VesuPositionApiTokenInfo | null | undefined
): bigint | undefined {
  if (
    !token?.value ||
    token.decimals == null ||
    !token.usdPrice?.value ||
    token.usdPrice.decimals == null
  ) {
    return undefined;
  }

  return amountToValueDelta(
    BigInt(token.value),
    normalizeVesuDecimal(token.usdPrice.value, token.usdPrice.decimals),
    tokenScale(token.decimals),
    "floor"
  );
}

function assertAssetsDenomination(
  action: "borrow" | "repay",
  side: "collateral" | "debt",
  denomination: LendingAmountDenomination
): void {
  if (denomination === "assets") {
    return;
  }
  throw new Error(
    `Vesu ${action} currently supports only "assets" denomination for ${side}; received "${denomination}"`
  );
}

function tokenScale(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function amountToValueDelta(
  amountDelta: bigint,
  price: bigint,
  scale: bigint,
  rounding: "floor" | "ceil"
): bigint {
  const magnitude = amountDelta < 0n ? -amountDelta : amountDelta;
  if (magnitude === 0n) {
    return 0n;
  }
  const numerator = magnitude * price;
  const quotient =
    rounding === "ceil" ? (numerator + scale - 1n) / scale : numerator / scale;
  return amountDelta < 0n ? -quotient : quotient;
}

function roundingForDelta(
  amountDelta: bigint,
  positiveRounding: "floor" | "ceil"
): "floor" | "ceil" {
  if (amountDelta >= 0n) {
    return positiveRounding;
  }
  return positiveRounding === "floor" ? "ceil" : "floor";
}

function clampNonNegative(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

function encodeAmount(
  value: bigint,
  denomination: LendingAmountDenomination
): [number, ReturnType<typeof uint256.bnToUint256>, 0 | 1] {
  return [
    denomination === "native" ? 0 : 1,
    uint256.bnToUint256(value < 0n ? -value : value),
    value < 0n ? 1 : 0,
  ];
}

function parseBool(raw: unknown, label: string): boolean {
  if (raw == null) {
    throw new Error(`Missing felt value for "${label}"`);
  }
  try {
    return BigInt(String(raw)) !== 0n;
  } catch {
    throw new Error(
      `Invalid felt value for "${label}": expected numeric, got ${String(raw)}`
    );
  }
}

function parseU256(result: unknown[], offset: number, label: string): bigint {
  if (offset < 0 || offset + 1 >= result.length) {
    throw new Error(
      `Invalid offset ${offset} for u256 "${label}" (result length: ${result.length})`
    );
  }
  const lowWord = result[offset];
  const highWord = result[offset + 1];
  if (lowWord == null || highWord == null) {
    throw new Error(`Missing u256 words for "${label}" at offset ${offset}`);
  }
  try {
    const low = BigInt(String(lowWord));
    const high = BigInt(String(highWord));
    return low + (high << 128n);
  } catch {
    throw new Error(
      `Invalid u256 words for "${label}" at offset ${offset}: [${String(lowWord)}, ${String(highWord)}]`
    );
  }
}
