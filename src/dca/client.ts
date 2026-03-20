import { resolveWalletAddress, type ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import type { SwapQuote } from "@/swap";
import type {
  DcaCancelInput,
  DcaClientInterface,
  DcaCreateInput,
  DcaCyclePreviewRequest,
  DcaExecutionContext,
  DcaOrdersInput,
  DcaOrdersPage,
  DcaProvider,
  DcaProviderContext,
  PreparedDcaAction,
} from "@/dca/interface";
import { assertPreparedCalls } from "@/providers/assert";
import { AvnuDcaProvider } from "@/dca/avnu";
import {
  assertDcaContext,
  hydrateDcaCancelInput,
  hydrateDcaCreateInput,
  hydrateDcaOrdersInput,
  resolveDcaSource,
} from "@/dca/utils";
import { resolveSwapInput } from "@/swap/utils";
import { ProviderRegistry } from "@/providers/registry";

export class DcaClient implements DcaClientInterface {
  private readonly context: DcaExecutionContext;
  private readonly registry: ProviderRegistry<DcaProvider>;

  constructor(context: DcaExecutionContext, defaultProvider?: DcaProvider) {
    this.context = context;
    this.registry = new ProviderRegistry("DCA");
    this.registry.register(defaultProvider ?? new AvnuDcaProvider(), true);
  }

  registerProvider(provider: DcaProvider, makeDefault = false): void {
    this.registry.register(provider, makeDefault);
  }

  setDefaultProvider(providerId: string): void {
    this.registry.setDefault(providerId);
  }

  getDcaProvider(providerId: string): DcaProvider {
    return this.registry.get(providerId);
  }

  getDefaultDcaProvider(): DcaProvider {
    return this.registry.getDefault();
  }

  listProviders(): string[] {
    return this.registry.list();
  }

  async getOrders(request: DcaOrdersInput = {}): Promise<DcaOrdersPage> {
    const provider = this.resolveRequestProvider(request.provider);
    return provider.getOrders(
      this.providerContext(),
      hydrateDcaOrdersInput(request, this.context.address)
    );
  }

  async prepareCreate(request: DcaCreateInput): Promise<PreparedDcaAction> {
    const provider = this.resolveRequestProvider(request.provider);
    const prepared = await provider.prepareCreate(
      this.providerContext(),
      hydrateDcaCreateInput(request, this.context.address)
    );

    assertPreparedCalls(prepared.calls, "DCA", provider.id);
    return prepared;
  }

  async create(request: DcaCreateInput, options?: ExecuteOptions): Promise<Tx> {
    const prepared = await this.prepareCreate(request);
    return this.context.execute(prepared.calls, options);
  }

  async prepareCancel(request: DcaCancelInput): Promise<PreparedDcaAction> {
    const provider = this.resolveRequestProvider(request.provider);
    const prepared = await provider.prepareCancel(
      this.providerContext(),
      hydrateDcaCancelInput(request)
    );

    assertPreparedCalls(prepared.calls, "DCA", provider.id);
    return prepared;
  }

  async cancel(request: DcaCancelInput, options?: ExecuteOptions): Promise<Tx> {
    const prepared = await this.prepareCancel(request);
    return this.context.execute(prepared.calls, options);
  }

  async previewCycle(request: DcaCyclePreviewRequest): Promise<SwapQuote> {
    const takerAddress =
      request.traderAddress != null
        ? resolveWalletAddress(request.traderAddress)
        : undefined;

    const { provider, request: resolvedRequest } = resolveSwapInput(
      {
        tokenIn: request.sellToken,
        tokenOut: request.buyToken,
        amountIn: request.sellAmountPerCycle,
        ...(request.swapProvider != null && { provider: request.swapProvider }),
        ...(request.chainId != null && { chainId: request.chainId }),
        ...(takerAddress != null && { takerAddress }),
        ...(request.slippageBps != null && {
          slippageBps: request.slippageBps,
        }),
      },
      {
        walletChainId: this.context.getChainId(),
        takerAddress: this.context.address,
        providerResolver: this.context,
      }
    );

    return provider.getQuote(resolvedRequest);
  }

  private resolveRequestProvider(source: DcaProvider | string | undefined) {
    const provider = resolveDcaSource(source, this);
    assertDcaContext(provider, this.context.getChainId());
    return provider;
  }

  private providerContext(): DcaProviderContext {
    return {
      chainId: this.context.getChainId(),
      rpcProvider: this.context.getProvider(),
      walletAddress: this.context.address,
    };
  }
}
