import type {
  LendingAmountDenomination,
  LendingBorrowRequest,
  LendingDepositRequest,
  LendingHealth,
  LendingHealthRequest,
  LendingMarket,
  LendingPosition,
  LendingPositionRequest,
  LendingProvider,
  LendingProviderContext,
  LendingRepayRequest,
  LendingWithdrawRequest,
  PreparedLendingAction,
} from "@/lending/interface";
import { type Address, type ChainId, fromAddress, type Token } from "@/types";
import { CallData, type Call, uint256 } from "starknet";
import { vesuPresets, type VesuChainConfig } from "@/lending/vesu/presets";

type VesuChain = "SN_MAIN" | "SN_SEPOLIA";

interface VesuMarketApiItem {
  pool?: { id?: string };
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
  };
}

interface VesuMarketsResponse {
  data?: VesuMarketApiItem[];
}

export interface VesuLendingProviderOptions {
  fetcher?: typeof fetch;
  chainConfigs?: Partial<
    Record<
      VesuChain,
      {
        poolFactory?: Address | string;
        defaultPool?: Address | string;
        marketsApiUrl?: string | null;
      }
    >
  >;
}

export class VesuLendingProvider implements LendingProvider {
  readonly id = "vesu";

  private readonly fetcher: typeof fetch;
  private readonly chainConfigs: Partial<Record<VesuChain, VesuChainConfig>>;
  private readonly vTokenCache = new Map<string, Address>();

  constructor(options: VesuLendingProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;

    const chainConfigs: Partial<Record<VesuChain, VesuChainConfig>> = {
      SN_MAIN: { ...vesuPresets.SN_MAIN },
    };
    for (const literal of ["SN_MAIN", "SN_SEPOLIA"] as const) {
      const override = options.chainConfigs?.[literal];
      if (!override) {
        continue;
      }
      const base = chainConfigs[literal];
      const poolFactoryRaw = override.poolFactory ?? base?.poolFactory;
      if (!poolFactoryRaw) {
        throw new Error(
          `Missing poolFactory for Vesu chain "${literal}". Provide chainConfigs.${literal}.poolFactory`
        );
      }
      chainConfigs[literal] = {
        poolFactory: fromAddress(poolFactoryRaw),
        ...(override.defaultPool != null || base?.defaultPool != null
          ? {
              defaultPool: fromAddress(
                override.defaultPool ?? (base?.defaultPool as Address)
              ),
            }
          : {}),
        ...(override.marketsApiUrl !== undefined
          ? override.marketsApiUrl
            ? { marketsApiUrl: override.marketsApiUrl }
            : {}
          : base?.marketsApiUrl
            ? { marketsApiUrl: base.marketsApiUrl }
            : {}),
      };
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
    const payload = (await response.json()) as VesuMarketsResponse;
    if (!response.ok) {
      throw new Error(`Vesu markets request failed (${response.status})`);
    }

    return (payload.data ?? [])
      .map((entry) => this.toMarket(entry))
      .filter((market): market is LendingMarket => market != null);
  }

  async prepareDeposit(
    context: LendingProviderContext,
    request: LendingDepositRequest
  ): Promise<PreparedLendingAction> {
    const config = this.requireChainConfig(context.chainId);
    const poolAddress = this.resolvePoolAddress(request.poolAddress, config);
    const receiver = request.receiver ?? context.walletAddress;
    const amount = request.amount.toBase();
    const vTokenAddress = await this.resolveVTokenAddress(
      context,
      poolAddress,
      request.token.address
    );

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
    const config = this.requireChainConfig(context.chainId);
    const poolAddress = this.resolvePoolAddress(request.poolAddress, config);
    const receiver = request.receiver ?? context.walletAddress;
    const owner = request.owner ?? context.walletAddress;
    const amount = request.amount.toBase();
    const vTokenAddress = await this.resolveVTokenAddress(
      context,
      poolAddress,
      request.token.address
    );

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

  async prepareBorrow(
    context: LendingProviderContext,
    request: LendingBorrowRequest
  ): Promise<PreparedLendingAction> {
    const config = this.requireChainConfig(context.chainId);
    const poolAddress = this.resolvePoolAddress(request.poolAddress, config);
    const collateralAmount = request.collateralAmount?.toBase() ?? 0n;
    const collateralDenomination = request.collateralDenomination ?? "assets";
    const debtAmount = request.amount.toBase();
    const user = request.user ?? context.walletAddress;
    const debtDenomination = request.debtDenomination ?? "assets";
    const calls: Call[] = [];

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
    const config = this.requireChainConfig(context.chainId);
    const poolAddress = this.resolvePoolAddress(request.poolAddress, config);
    const collateralAmount = request.collateralAmount?.toBase() ?? 0n;
    const collateralDenomination = request.collateralDenomination ?? "assets";
    const withdrawCollateral = request.withdrawCollateral ?? false;
    const debtAmount = request.amount.toBase();
    const user = request.user ?? context.walletAddress;
    const debtDenomination = request.debtDenomination ?? "assets";

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
    const config = this.requireChainConfig(context.chainId);
    const poolAddress = this.resolvePoolAddress(request.poolAddress, config);
    const user = request.user ?? context.walletAddress;

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
      collateralValue: parseU256(positionResult, 4, "collateral_value"),
      debtValue: parseU256(positionResult, 6, "debt_value"),
      isCollateralized: health.isCollateralized,
    };
  }

  async getHealth(
    context: LendingProviderContext,
    request: LendingHealthRequest
  ): Promise<LendingHealth> {
    const config = this.requireChainConfig(context.chainId);
    const poolAddress = this.resolvePoolAddress(request.poolAddress, config);
    const user = request.user ?? context.walletAddress;

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

  private async resolveVTokenAddress(
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
    const result = await context.provider.callContract({
      contractAddress: poolFactory,
      entrypoint: "v_token_for_asset",
      calldata: CallData.compile([poolAddress, assetAddress]),
    });
    const candidate = result[0];
    if (!candidate) {
      throw new Error("Unable to resolve Vesu vToken for asset");
    }
    const resolved = fromAddress(candidate);
    this.vTokenCache.set(key, resolved);
    return resolved;
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
        `Vesu provider does not support chain "${chainId.toLiteral()}". Configure chainConfigs with a poolFactory to enable it.`
      );
    }
    return config;
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

    return {
      protocol: this.id,
      poolAddress: fromAddress(entry.pool.id),
      asset: {
        address: fromAddress(entry.address),
        symbol: entry.symbol,
        decimals: entry.decimals,
        name: entry.name,
      },
      vTokenAddress: fromAddress(entry.vToken.address),
      ...(entry.vToken.symbol ? { vTokenSymbol: entry.vToken.symbol } : {}),
      ...(entry.stats?.canBeBorrowed != null
        ? { canBeBorrowed: entry.stats.canBeBorrowed }
        : {}),
    };
  }
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
  return BigInt(String(raw)) !== 0n;
}

function parseU256(result: unknown[], offset: number, label: string): bigint {
  const lowWord = result[offset];
  const highWord = result[offset + 1];
  if (lowWord == null || highWord == null) {
    throw new Error(`Missing u256 words for "${label}" at offset ${offset}`);
  }
  const low = BigInt(String(lowWord));
  const high = BigInt(String(highWord));
  return low + (high << 128n);
}
