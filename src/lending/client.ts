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
  LendingWithdrawMaxRequest,
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
  hydrateWithdrawMaxRequest,
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
    return await this.resolveRequestProvider(request.provider).getMarkets(
      this.context.getChainId()
    );
  }

  async prepareDeposit(
    request: LendingDepositRequest
  ): Promise<PreparedLendingAction> {
    return await this.prepareWithProvider(
      request,
      hydrateDepositRequest,
      (provider, context, hydrated) =>
        provider.prepareDeposit(context, hydrated)
    );
  }

  async deposit(
    request: LendingDepositRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.executePrepared(this.prepareDeposit(request), options);
  }

  async prepareWithdraw(
    request: LendingWithdrawRequest
  ): Promise<PreparedLendingAction> {
    return await this.prepareWithProvider(
      request,
      hydrateWithdrawRequest,
      (provider, context, hydrated) =>
        provider.prepareWithdraw(context, hydrated)
    );
  }

  async withdraw(
    request: LendingWithdrawRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.executePrepared(this.prepareWithdraw(request), options);
  }

  async prepareWithdrawMax(
    request: LendingWithdrawMaxRequest
  ): Promise<PreparedLendingAction> {
    return await this.prepareWithProvider(
      request,
      hydrateWithdrawMaxRequest,
      (provider, context, hydrated) => {
        if (!provider.prepareWithdrawMax) {
          throw new Error(
            `Lending provider "${provider.id}" does not support max-withdraw`
          );
        }
        return provider.prepareWithdrawMax(context, hydrated);
      }
    );
  }

  async withdrawMax(
    request: LendingWithdrawMaxRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.executePrepared(
      this.prepareWithdrawMax(request),
      options
    );
  }

  async prepareBorrow(
    request: LendingBorrowRequest
  ): Promise<PreparedLendingAction> {
    return await this.prepareWithProvider(
      request,
      hydrateBorrowRequest,
      (provider, context, hydrated) => provider.prepareBorrow(context, hydrated)
    );
  }

  async borrow(
    request: LendingBorrowRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.executePrepared(this.prepareBorrow(request), options);
  }

  async prepareRepay(
    request: LendingRepayRequest
  ): Promise<PreparedLendingAction> {
    return await this.prepareWithProvider(
      request,
      hydrateRepayRequest,
      (provider, context, hydrated) => provider.prepareRepay(context, hydrated)
    );
  }

  async repay(
    request: LendingRepayRequest,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.executePrepared(this.prepareRepay(request), options);
  }

  async getPosition(request: LendingPositionRequest): Promise<LendingPosition> {
    const provider = this.resolveRequestProvider(request.provider);
    return await provider.getPosition(this.providerContext(), {
      ...stripProvider(request),
      user: request.user ?? this.context.address,
    });
  }

  async getHealth(
    request: LendingHealthQuoteRequest["health"]
  ): Promise<LendingHealth> {
    const provider = this.resolveRequestProvider(request.provider);
    return await provider.getHealth(this.providerContext(), {
      ...hydrateHealthRequest(request, this.context.address),
    });
  }

  async quoteHealth(
    request: LendingHealthQuoteRequest
  ): Promise<LendingHealthQuote> {
    this.assertQuoteHealthCompatibility(request);
    const current = await this.getHealth(request.health);
    const prepared = await this.prepareAction(request.action);
    const simulation = await this.context.preflight({
      calls: prepared.calls,
      ...(request.feeMode != null && { feeMode: request.feeMode }),
    });
    const projected = await this.projectHealth(request, current);
    return { current, prepared, simulation, projected };
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

  private async projectHealth(
    request: LendingHealthQuoteRequest,
    current: LendingHealth
  ): Promise<LendingHealth | null> {
    const [healthProvider, actionProvider] =
      this.resolveQuoteProviders(request);
    if (healthProvider !== actionProvider) {
      return null;
    }
    if (!actionProvider.quoteProjectedHealth) {
      return null;
    }
    return await actionProvider.quoteProjectedHealth(
      this.providerContext(),
      request,
      current
    );
  }

  private assertQuoteHealthCompatibility(
    request: LendingHealthQuoteRequest
  ): void {
    const [healthProvider, actionProvider] =
      this.resolveQuoteProviders(request);
    if (healthProvider !== actionProvider) {
      throw new Error(
        "quoteHealth requires action and health to use the same lending provider"
      );
    }

    if (
      request.action.action !== "borrow" &&
      request.action.action !== "repay"
    ) {
      return;
    }

    const healthRequest = hydrateHealthRequest(
      request.health,
      this.context.address
    );
    const actionRequest =
      request.action.action === "borrow"
        ? hydrateBorrowRequest(request.action.request, this.context.address)
        : hydrateRepayRequest(request.action.request, this.context.address);

    if (
      actionRequest.poolAddress !== healthRequest.poolAddress ||
      actionRequest.user !== healthRequest.user ||
      actionRequest.collateralToken.address !==
        healthRequest.collateralToken.address ||
      actionRequest.debtToken.address !== healthRequest.debtToken.address
    ) {
      throw new Error(
        "quoteHealth requires action and health to target the same lending position"
      );
    }
  }

  private resolveRequestProvider(
    source: LendingProvider | string | undefined
  ): LendingProvider {
    const provider = resolveLendingSource(source, this);
    assertLendingContext(provider, this.context.getChainId());
    return provider;
  }

  private resolveQuoteProviders(
    request: LendingHealthQuoteRequest
  ): [LendingProvider, LendingProvider] {
    return [
      this.resolveRequestProvider(request.health.provider),
      this.resolveRequestProvider(request.action.request.provider),
    ];
  }

  private async prepareWithProvider<
    TRequest extends { provider?: LendingProvider | string },
    THydrated,
  >(
    request: TRequest,
    hydrate: (
      request: TRequest,
      walletAddress: LendingProviderContext["walletAddress"]
    ) => THydrated,
    prepare: (
      provider: LendingProvider,
      context: LendingProviderContext,
      hydrated: THydrated
    ) => Promise<PreparedLendingAction>
  ): Promise<PreparedLendingAction> {
    const provider = this.resolveRequestProvider(request.provider);
    const prepared = await prepare(
      provider,
      this.providerContext(),
      hydrate(request, this.context.address)
    );
    this.assertPreparedCalls(prepared, provider.id);
    return prepared;
  }

  private async executePrepared(
    preparedPromise: Promise<PreparedLendingAction>,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.context.execute((await preparedPromise).calls, options);
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
