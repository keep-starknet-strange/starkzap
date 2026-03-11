import { resolveWalletAddress, type ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import type {
  DcaCancelInput,
  DcaCancelRequest,
  DcaClientInterface,
  DcaCreateInput,
  DcaCreateRequest,
  DcaCyclePreviewRequest,
  DcaExecutionContext,
  DcaOrdersInput,
  DcaOrdersPage,
  DcaProvider,
  DcaProviderContext,
  PreparedDcaAction,
} from "@/dca/interface";
import { AvnuDcaProvider } from "@/dca/avnu";
import {
  assertDcaContext,
  hydrateDcaCancelInput,
  hydrateDcaCreateInput,
  hydrateDcaOrdersInput,
  resolveDcaSource,
} from "@/dca/utils";
import { resolveSwapInput } from "@/swap/utils";

export class DcaClient implements DcaClientInterface {
  private readonly context: DcaExecutionContext;
  private readonly providers: Map<string, DcaProvider>;
  private defaultProviderId: string | null = null;

  constructor(context: DcaExecutionContext, defaultProvider?: DcaProvider) {
    this.context = context;
    this.providers = new Map();
    this.registerProvider(defaultProvider ?? new AvnuDcaProvider(), true);
  }

  registerProvider(provider: DcaProvider, makeDefault = false): void {
    this.providers.set(provider.id, provider);
    if (makeDefault || this.defaultProviderId == null) {
      this.defaultProviderId = provider.id;
    }
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(
        `Unknown DCA provider "${providerId}". Registered providers: ${this.listProviders().join(", ")}`
      );
    }
    this.defaultProviderId = providerId;
  }

  getDcaProvider(providerId: string): DcaProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `Unknown DCA provider "${providerId}". Registered providers: ${this.listProviders().join(", ")}`
      );
    }
    return provider;
  }

  getDefaultDcaProvider(): DcaProvider {
    if (!this.defaultProviderId) {
      throw new Error("No default DCA provider configured");
    }
    return this.getDcaProvider(this.defaultProviderId);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async getOrders(request: DcaOrdersInput = {}): Promise<DcaOrdersPage> {
    const provider = this.resolveRequestProvider(request.provider);
    return await provider.getOrders(
      this.providerContext(),
      hydrateDcaOrdersInput(request, this.context.address)
    );
  }

  async prepareCreate(request: DcaCreateInput): Promise<PreparedDcaAction> {
    return await this.prepareWithProvider(
      request,
      hydrateDcaCreateInput,
      (provider, context, hydrated) => provider.prepareCreate(context, hydrated)
    );
  }

  async create(request: DcaCreateInput, options?: ExecuteOptions): Promise<Tx> {
    return await this.executePrepared(this.prepareCreate(request), options);
  }

  async prepareCancel(request: DcaCancelInput): Promise<PreparedDcaAction> {
    return await this.prepareWithProvider(
      request,
      hydrateDcaCancelInput,
      (provider, context, hydrated) => provider.prepareCancel(context, hydrated)
    );
  }

  async cancel(request: DcaCancelInput, options?: ExecuteOptions): Promise<Tx> {
    return await this.executePrepared(this.prepareCancel(request), options);
  }

  async previewCycle(request: DcaCyclePreviewRequest) {
    const takerAddress =
      request.traderAddress != null
        ? resolveWalletAddress(request.traderAddress)
        : undefined;
    const swapInput = {
      tokenIn: request.sellToken,
      tokenOut: request.buyToken,
      amountIn: request.sellAmountPerCycle,
      ...(request.swapProvider != null && { provider: request.swapProvider }),
      ...(request.chainId != null && { chainId: request.chainId }),
      ...(takerAddress != null && { takerAddress }),
      ...(request.slippageBps != null && {
        slippageBps: request.slippageBps,
      }),
    };
    const { provider, request: resolvedRequest } = resolveSwapInput(swapInput, {
      walletChainId: this.context.getChainId(),
      takerAddress: this.context.address,
      providerResolver: this.context,
    });

    return await provider.getQuote(resolvedRequest);
  }

  private resolveRequestProvider(source: DcaProvider | string | undefined) {
    const provider = resolveDcaSource(source, this);
    assertDcaContext(provider, this.context.getChainId());
    return provider;
  }

  private providerContext(): DcaProviderContext {
    return {
      chainId: this.context.getChainId(),
      provider: this.context.getProvider(),
      walletAddress: this.context.address,
    };
  }

  private async prepareWithProvider<
    TInput extends { provider?: DcaProvider | string },
    TRequest extends DcaCreateRequest | DcaCancelRequest,
  >(
    request: TInput,
    hydrate: (
      request: TInput,
      walletAddress: DcaProviderContext["walletAddress"]
    ) => TRequest,
    prepare: (
      provider: DcaProvider,
      context: DcaProviderContext,
      hydrated: TRequest
    ) => Promise<PreparedDcaAction>
  ): Promise<PreparedDcaAction> {
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
    preparedPromise: Promise<PreparedDcaAction>,
    options?: ExecuteOptions
  ): Promise<Tx> {
    return await this.context.execute((await preparedPromise).calls, options);
  }

  private assertPreparedCalls(
    prepared: PreparedDcaAction,
    providerId: string
  ): void {
    if (prepared.calls.length > 0) {
      return;
    }
    throw new Error(`DCA provider "${providerId}" returned no calls`);
  }
}
