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

export interface LendingMarket {
  protocol: string;
  poolAddress: Address;
  asset: Token;
  vTokenAddress: Address;
  vTokenSymbol?: string;
  canBeBorrowed?: boolean;
}

export interface LendingPosition {
  collateralShares: bigint;
  nominalDebt: bigint;
  /** Collateral amount in collateral asset base units. */
  collateralAmount?: bigint;
  /** Debt amount in debt asset base units. */
  debtAmount?: bigint;
  /** Collateral USD value from protocol collateralization check [SCALE]. */
  collateralValue: bigint;
  /** Debt USD value from protocol collateralization check [SCALE]. */
  debtValue: bigint;
  isCollateralized: boolean;
}

export interface LendingHealth {
  isCollateralized: boolean;
  collateralValue: bigint;
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
}
