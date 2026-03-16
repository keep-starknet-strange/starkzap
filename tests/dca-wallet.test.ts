import { describe, expect, it, vi } from "vitest";
import type {
  Account,
  Call,
  EstimateFeeResponseOverhead,
  RpcProvider,
  Signature,
  TypedData,
} from "starknet";
import { BaseWallet } from "@/wallet/base";
import {
  Amount,
  ChainId,
  fromAddress,
  type ExecuteOptions,
  type Token,
} from "@/types";
import type { DcaProvider } from "@/dca";
import type { SwapProvider } from "@/swap";
import type { Tx } from "@/tx";

const sellToken: Token = {
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress("0x111"),
};

const buyToken: Token = {
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  address: fromAddress("0x222"),
};

const dcaCreateCall: Call = {
  contractAddress: fromAddress("0x501"),
  entrypoint: "open_dca",
  calldata: [1, 2, 3],
};

const dcaCancelCall: Call = {
  contractAddress: fromAddress("0x502"),
  entrypoint: "cancel_dca",
  calldata: [4, 5, 6],
};

function createDcaProvider(overrides: Partial<DcaProvider> = {}): DcaProvider {
  return {
    id: "avnu",
    supportsChain: () => true,
    getOrders: vi.fn().mockResolvedValue({
      content: [],
      totalPages: 0,
      totalElements: 0,
      size: 10,
      pageNumber: 0,
    }),
    prepareCreate: vi.fn().mockResolvedValue({
      providerId: "avnu",
      action: "create",
      calls: [dcaCreateCall],
    }),
    prepareCancel: vi.fn().mockResolvedValue({
      providerId: "avnu",
      action: "cancel",
      calls: [dcaCancelCall],
      orderAddress: fromAddress("0x123"),
    }),
    ...overrides,
  };
}

function createSwapProvider(
  id: string,
  overrides: Partial<SwapProvider> = {}
): SwapProvider {
  return {
    id,
    supportsChain: () => true,
    getQuote: vi.fn().mockResolvedValue({
      amountInBase: 1000000n,
      amountOutBase: 200000000000000000n,
      provider: id,
    }),
    prepareSwap: vi.fn(),
    ...overrides,
  };
}

class TestWallet extends BaseWallet {
  readonly executeSpy = vi.fn<(...args: unknown[]) => Promise<Tx>>();
  private readonly rpcProvider = {} as RpcProvider;

  constructor(
    defaultDcaProvider?: DcaProvider,
    defaultSwapProvider?: SwapProvider
  ) {
    super(
      fromAddress("0xCAFE"),
      undefined,
      defaultSwapProvider,
      undefined,
      defaultDcaProvider
    );
    this.executeSpy.mockResolvedValue({ hash: "0xtx" } as Tx);
  }

  async isDeployed(): Promise<boolean> {
    return true;
  }

  async ensureReady(): Promise<void> {}

  async deploy(): Promise<Tx> {
    return { hash: "0xdeploy" } as Tx;
  }

  async execute(calls: Call[], options?: ExecuteOptions): Promise<Tx> {
    return this.executeSpy(calls, options);
  }

  async signMessage(_typedData: TypedData): Promise<Signature> {
    return [] as unknown as Signature;
  }

  async preflight() {
    return { ok: true as const };
  }

  getAccount(): Account {
    return {} as Account;
  }

  getProvider(): RpcProvider {
    return this.rpcProvider;
  }

  getChainId(): ChainId {
    return ChainId.SEPOLIA;
  }

  getFeeMode() {
    return "user_pays" as const;
  }

  getClassHash(): string {
    return "0x1";
  }

  async estimateFee(): Promise<EstimateFeeResponseOverhead> {
    return {} as EstimateFeeResponseOverhead;
  }

  async disconnect(): Promise<void> {}
}

describe("BaseWallet DCA abstraction", () => {
  it("executes provider create calls with options", async () => {
    const provider = createDcaProvider();
    const wallet = new TestWallet(provider);
    const options: ExecuteOptions = { feeMode: "sponsored" };

    const tx = await wallet.dca().create(
      {
        provider,
        sellToken,
        buyToken,
        sellAmount: Amount.parse("5", sellToken),
        sellAmountPerCycle: Amount.parse("1", sellToken),
        frequency: "P1D",
      },
      options
    );

    expect(provider.prepareCreate).toHaveBeenCalledTimes(1);
    expect(wallet.executeSpy).toHaveBeenCalledWith([dcaCreateCall], options);
    expect(tx).toEqual({ hash: "0xtx" });
  });

  it("defaults order listing to the connected wallet address", async () => {
    const provider = createDcaProvider();
    const wallet = new TestWallet(provider);

    await wallet.dca().getOrders({ provider });

    expect(provider.getOrders).toHaveBeenCalledWith(
      {
        chainId: ChainId.SEPOLIA,
        rpcProvider: wallet.getProvider(),
        walletAddress: wallet.address,
      },
      {
        traderAddress: wallet.address,
      }
    );
  });

  it("supports previewing a cycle through a registered EKUBO swap provider", async () => {
    const defaultSwapProvider = createSwapProvider("avnu");
    const ekuboProvider = createSwapProvider("ekubo");
    const wallet = new TestWallet(createDcaProvider(), defaultSwapProvider);
    wallet.registerSwapProvider(ekuboProvider);
    const sellAmountPerCycle = Amount.parse("1", sellToken);

    const quote = await wallet.dca().previewCycle({
      swapProvider: "ekubo",
      sellToken,
      buyToken,
      sellAmountPerCycle,
    });

    expect(ekuboProvider.getQuote).toHaveBeenCalledWith({
      chainId: ChainId.SEPOLIA,
      takerAddress: wallet.address,
      tokenIn: sellToken,
      tokenOut: buyToken,
      amountIn: sellAmountPerCycle,
    });
    expect(quote.provider).toBe("ekubo");
  });

  it("accepts raw order address input for cancel", async () => {
    const provider = createDcaProvider();
    const wallet = new TestWallet(provider);

    await wallet.dca().cancel(
      {
        provider,
        orderAddress: "0x123",
      },
      { feeMode: "user_pays" }
    );

    expect(provider.prepareCancel).toHaveBeenCalledWith(
      {
        chainId: ChainId.SEPOLIA,
        rpcProvider: wallet.getProvider(),
        walletAddress: wallet.address,
      },
      {
        orderAddress: fromAddress("0x123"),
      }
    );
    expect(wallet.executeSpy).toHaveBeenCalledWith([dcaCancelCall], {
      feeMode: "user_pays",
    });
  });

  it("forwards provider-native order ids for cancel", async () => {
    const provider = createDcaProvider();
    const wallet = new TestWallet(provider);

    await wallet.dca().cancel({
      provider,
      orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
    });

    expect(provider.prepareCancel).toHaveBeenCalledWith(
      {
        chainId: ChainId.SEPOLIA,
        rpcProvider: wallet.getProvider(),
        walletAddress: wallet.address,
      },
      {
        orderId: "ekubo-v1:0x1:7:0x111:0x222:300:1710000000:1710086400",
      }
    );
  });
});
