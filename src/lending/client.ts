import type {
  LendingActionInput,
  LendingBorrowRequest,
  LendingDepositRequest,
  LendingExecutionContext,
  LendingHealth,
  LendingHealthQuote,
  LendingHealthQuoteRequest,
  LendingMarketsRequest,
  LendingMarket,
  LendingPosition,
  LendingPositionRequest,
  LendingProvider,
  LendingProviderContext,
  LendingRepayRequest,
  LendingWithdrawRequest,
  PreparedLendingAction,
} from "@/lending/interface";
import { VesuLendingProvider } from "@/lending/vesu";
import type { ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import {
  assertLendingContext,
  hydrateBorrowRequest,
  hydrateDepositRequest,
  hydrateHealthRequest,
  hydrateRepayRequest,
  hydrateWithdrawRequest,
  resolveLendingSource,
  stripProvider,
} from "@/lending/utils";

export class LendingClient {
  private readonly context: LendingExecutionContext;
  private readonly providers: Map<string, LendingProvider>;
  private defaultProviderId: string | null = null;

  constructor(
    context: LendingExecutionContext,
    defaultProvider?: LendingProvider
  ) {
    this.context = context;
    this.providers = new Map();
    this.registerProvider(defaultProvider ?? new VesuLendingProvider(), true);
  }

  registerProvider(provider: LendingProvider, makeDefault = false): void {
    this.providers.set(provider.id, provider);
    if (makeDefault || this.defaultProviderId == null) {
      this.defaultProviderId = provider.id;
    }
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(
        `Unknown lending provider "${providerId}". Registered providers: ${this.listProviders().join(", ")}`
      );
    }
    this.defaultProviderId = providerId;
  }

  getLendingProvider(providerId: string): LendingProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `Unknown lending provider "${providerId}". Registered providers: ${this.listProviders().join(", ")}`
      );
    }
    return provider;
  }

  getDefaultLendingProvider(): LendingProvider {
    if (!this.defaultProviderId) {
      throw new Error("No default lending provider configured");
    }
    return this.getLendingProvider(this.defaultProviderId);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async getMarkets(
    request: LendingMarketsRequest = {}
  ): Promise<LendingMarket[]> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    return await provider.getMarkets(chainId);
  }

  async prepareDeposit(
    request: LendingDepositRequest
  ): Promise<PreparedLendingAction> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    const prepared = await provider.prepareDeposit(this.providerContext(), {
      ...hydrateDepositRequest(request, this.context.address),
    });
    this.assertPreparedCalls(prepared, provider.id);
    return prepared;
  }

  async deposit(
    request: LendingDepositRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const prepared = await this.prepareDeposit(request);
    return await this.context.execute(prepared.calls, options);
  }

  async prepareWithdraw(
    request: LendingWithdrawRequest
  ): Promise<PreparedLendingAction> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    const prepared = await provider.prepareWithdraw(this.providerContext(), {
      ...hydrateWithdrawRequest(request, this.context.address),
    });
    this.assertPreparedCalls(prepared, provider.id);
    return prepared;
  }

  async withdraw(
    request: LendingWithdrawRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const prepared = await this.prepareWithdraw(request);
    return await this.context.execute(prepared.calls, options);
  }

  async prepareBorrow(
    request: LendingBorrowRequest
  ): Promise<PreparedLendingAction> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    const prepared = await provider.prepareBorrow(this.providerContext(), {
      ...hydrateBorrowRequest(request, this.context.address),
    });
    this.assertPreparedCalls(prepared, provider.id);
    return prepared;
  }

  async borrow(
    request: LendingBorrowRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const prepared = await this.prepareBorrow(request);
    return await this.context.execute(prepared.calls, options);
  }

  async prepareRepay(
    request: LendingRepayRequest
  ): Promise<PreparedLendingAction> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    const prepared = await provider.prepareRepay(this.providerContext(), {
      ...hydrateRepayRequest(request, this.context.address),
    });
    this.assertPreparedCalls(prepared, provider.id);
    return prepared;
  }

  async repay(
    request: LendingRepayRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    const prepared = await this.prepareRepay(request);
    return await this.context.execute(prepared.calls, options);
  }

  async getPosition(request: LendingPositionRequest): Promise<LendingPosition> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    return await provider.getPosition(this.providerContext(), {
      ...stripProvider(request),
      user: request.user ?? this.context.address,
    });
  }

  async getHealth(
    request: LendingHealthQuoteRequest["health"]
  ): Promise<LendingHealth> {
    const chainId = this.context.getChainId();
    const provider = resolveLendingSource(request.provider, this);
    assertLendingContext(provider, chainId);
    return await provider.getHealth(this.providerContext(), {
      ...hydrateHealthRequest(request, this.context.address),
    });
  }

  async quoteHealth(
    request: LendingHealthQuoteRequest
  ): Promise<LendingHealthQuote> {
    const current = await this.getHealth(request.health);
    const prepared = await this.prepareAction(request.action);
    const simulation = await this.context.preflight({
      calls: prepared.calls,
      ...(request.feeMode != null && { feeMode: request.feeMode }),
    });
    return { current, prepared, simulation };
  }

  private async prepareAction(
    input: LendingActionInput
  ): Promise<PreparedLendingAction> {
    if (input.action === "deposit") {
      return await this.prepareDeposit(input.request);
    }
    if (input.action === "withdraw") {
      return await this.prepareWithdraw(input.request);
    }
    if (input.action === "borrow") {
      return await this.prepareBorrow(input.request);
    }
    return await this.prepareRepay(input.request);
  }

  private providerContext(): LendingProviderContext {
    return {
      chainId: this.context.getChainId(),
      provider: this.context.getProvider(),
      walletAddress: this.context.address,
    };
  }

  private assertPreparedCalls(
    prepared: PreparedLendingAction,
    providerId: string
  ): void {
    if (prepared.calls.length > 0) {
      return;
    }
    throw new Error(`Lending provider "${providerId}" returned no calls`);
  }
}
