import type { Call, RpcProvider } from "starknet";
import type {
  Address,
  Amount,
  ChainId,
  ExecuteOptions,
  FeeMode,
  PreflightResult,
  Token,
} from "@/types";
import type { Tx } from "@/tx";

export type LendingAction = "deposit" | "withdraw" | "borrow" | "repay";
export type LendingAmountDenomination = "assets" | "native";

export interface LendingMarketStats {
  supplyApy?: Amount;
  borrowApr?: Amount;
  totalSupplied?: Amount;
  totalBorrowed?: Amount;
  utilization?: Amount;
}

export interface LendingMarket {
  protocol: string;
  poolAddress: Address;
  poolName?: string;
  asset: Token;
  vTokenAddress: Address;
  vTokenSymbol?: string;
  canBeBorrowed?: boolean;
  stats?: LendingMarketStats;
}

export interface LendingPosition {
  /** Collateral share balance as a protocol-native integer quantity. */
  collateralShares: bigint;
  /** Debt principal in the provider's native integer accounting units. */
  nominalDebt: bigint;
  /** Collateral amount in collateral asset base units. */
  collateralAmount?: bigint;
  /** Debt amount in debt asset base units. */
  debtAmount?: bigint;
  /** Collateral USD value on a 1e18 scale (for example, $1 = 1_000000000000000000n). */
  collateralValue: bigint;
  /** Debt USD value on a 1e18 scale (for example, $1 = 1_000000000000000000n). */
  debtValue: bigint;
  isCollateralized: boolean;
}

export interface LendingHealth {
  isCollateralized: boolean;
  /** Collateral USD value on a 1e18 scale (for example, $1 = 1_000000000000000000n). */
  collateralValue: bigint;
  /** Debt USD value on a 1e18 scale (for example, $1 = 1_000000000000000000n). */
  debtValue: bigint;
}

export interface PreparedLendingAction {
  providerId: string;
  action: LendingAction;
  calls: Call[];
  market?: LendingMarket;
}

export interface LendingExecutionContext {
  readonly address: Address;
  getChainId(): ChainId;
  getProvider(): RpcProvider;
  execute(calls: Call[], options?: ExecuteOptions): Promise<Tx>;
  preflight(options: {
    calls: Call[];
    feeMode?: FeeMode;
  }): Promise<PreflightResult>;
}

export interface LendingRequestBase {
  provider?: LendingProvider | string;
  poolAddress?: Address;
}

export interface LendingDepositRequest extends LendingRequestBase {
  token: Token;
  amount: Amount;
  receiver?: Address;
}

export interface LendingWithdrawRequest extends LendingRequestBase {
  token: Token;
  amount: Amount;
  receiver?: Address;
  owner?: Address;
}

export interface LendingWithdrawMaxRequest extends LendingRequestBase {
  token: Token;
  receiver?: Address;
  owner?: Address;
}

export interface LendingBorrowRequest extends LendingRequestBase {
  collateralToken: Token;
  debtToken: Token;
  amount: Amount;
  user?: Address;
  collateralAmount?: Amount;
  collateralDenomination?: LendingAmountDenomination;
  debtDenomination?: LendingAmountDenomination;
  /** Withdraw from earn position (vault) and use as collateral for this borrow. */
  useEarnPosition?: boolean;
}

export interface LendingRepayRequest extends LendingRequestBase {
  collateralToken: Token;
  debtToken: Token;
  amount: Amount;
  user?: Address;
  collateralAmount?: Amount;
  collateralDenomination?: LendingAmountDenomination;
  withdrawCollateral?: boolean;
  debtDenomination?: LendingAmountDenomination;
}

export interface LendingPositionRequest extends LendingRequestBase {
  collateralToken: Token;
  debtToken: Token;
  user?: Address;
}

export interface LendingHealthRequest extends LendingRequestBase {
  collateralToken: Token;
  debtToken: Token;
  user?: Address;
}

export type LendingActionInput =
  | { action: "deposit"; request: LendingDepositRequest }
  | { action: "withdraw"; request: LendingWithdrawRequest }
  | { action: "borrow"; request: LendingBorrowRequest }
  | { action: "repay"; request: LendingRepayRequest };

export interface LendingHealthQuoteRequest {
  action: LendingActionInput;
  health: LendingHealthRequest;
  feeMode?: FeeMode;
}

export interface LendingHealthQuote {
  current: LendingHealth;
  prepared: PreparedLendingAction;
  simulation: PreflightResult;
  /** Optional projected post-action health estimate from the provider. */
  projected?: LendingHealth | null;
}

export interface LendingProviderContext {
  chainId: ChainId;
  provider: RpcProvider;
  walletAddress: Address;
}

export interface LendingProviderResolver {
  getDefaultLendingProvider(): LendingProvider;
  getLendingProvider(providerId: string): LendingProvider;
}

export interface LendingMarketsRequest {
  provider?: LendingProvider | string;
}

export type LendingUserPositionType = "earn" | "borrow";

export interface LendingTokenBalance {
  token: Token;
  /** Token amount in base units as an integer bigint (smallest indivisible token unit). */
  amount: bigint;
  /** USD value on a 1e18 scale (for example, $1 = 1_000000000000000000n). */
  usdValue?: bigint;
}

export interface LendingUserPosition {
  type: LendingUserPositionType;
  pool: { id: Address; name?: string };
  collateral: LendingTokenBalance;
  collateralShares?: LendingTokenBalance;
  debt?: LendingTokenBalance;
}

export interface LendingUserPositionsRequest {
  provider?: LendingProvider | string;
  user?: Address;
}

export interface LendingMaxBorrowRequest extends LendingRequestBase {
  collateralToken: Token;
  debtToken: Token;
  user?: Address;
  /** Include redeemable earn-position collateral in the max borrow calculation. */
  useEarnPosition?: boolean;
}

export interface LendingProvider {
  readonly id: string;
  supportsChain(chainId: ChainId): boolean;
  getMarkets(chainId: ChainId): Promise<LendingMarket[]>;
  prepareDeposit(
    context: LendingProviderContext,
    request: LendingDepositRequest
  ): Promise<PreparedLendingAction>;
  prepareWithdraw(
    context: LendingProviderContext,
    request: LendingWithdrawRequest
  ): Promise<PreparedLendingAction>;
  prepareWithdrawMax?(
    context: LendingProviderContext,
    request: LendingWithdrawMaxRequest
  ): Promise<PreparedLendingAction>;
  prepareBorrow(
    context: LendingProviderContext,
    request: LendingBorrowRequest
  ): Promise<PreparedLendingAction>;
  prepareRepay(
    context: LendingProviderContext,
    request: LendingRepayRequest
  ): Promise<PreparedLendingAction>;
  getPosition(
    context: LendingProviderContext,
    request: LendingPositionRequest
  ): Promise<LendingPosition>;
  getHealth(
    context: LendingProviderContext,
    request: LendingHealthRequest
  ): Promise<LendingHealth>;
  quoteProjectedHealth?(
    context: LendingProviderContext,
    request: LendingHealthQuoteRequest,
    current: LendingHealth
  ): Promise<LendingHealth | null>;
  getPositions?(
    context: LendingProviderContext,
    request: LendingUserPositionsRequest
  ): Promise<LendingUserPosition[]>;
  getMaxBorrowAmount?(
    context: LendingProviderContext,
    request: LendingMaxBorrowRequest
  ): Promise<bigint>;
}
