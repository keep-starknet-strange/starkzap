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
import type { SwapProvider } from "@/swap";
import type { Tx } from "@/tx";

const mockToken: Token = {
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress(
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
  ),
};

const swapCall: Call = {
  contractAddress: fromAddress("0x123"),
  entrypoint: "swap",
  calldata: [4, 5, 6],
};

class TestWallet extends BaseWallet {
  readonly executeSpy = vi.fn<(...args: unknown[]) => Promise<Tx>>();

  constructor(defaultSwapProvider?: SwapProvider) {
    super(fromAddress("0xCAFE"), undefined, defaultSwapProvider);
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
    return {} as RpcProvider;
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

describe("BaseWallet swap abstraction", () => {
  it("returns provider quotes via getQuote", async () => {
    const wallet = new TestWallet();
    const amountIn = Amount.parse("50", mockToken);
    const quote = {
      amountInBase: amountIn.toBase(),
      amountOutBase: amountIn.toBase(),
      provider: "provider",
    } as const;

    const provider: SwapProvider = {
      id: "provider",
      supportsChain: () => true,
      getQuote: async () => quote,
      swap: async () => ({
        calls: [swapCall],
        quote,
      }),
    };

    const response = await wallet.getQuote({
      provider,
      chainId: ChainId.SEPOLIA,
      tokenIn: mockToken,
      tokenOut: mockToken,
      amountIn,
    });

    expect(response).toEqual(quote);
  });

  it("executes provider swap calls with options", async () => {
    const wallet = new TestWallet();
    const amountIn = Amount.parse("50", mockToken);
    const options: ExecuteOptions = { feeMode: "sponsored" };

    const provider: SwapProvider = {
      id: "provider",
      supportsChain: () => true,
      getQuote: async () => ({
        amountInBase: amountIn.toBase(),
        amountOutBase: amountIn.toBase(),
      }),
      swap: async () => ({
        calls: [swapCall],
        quote: {
          amountInBase: amountIn.toBase(),
          amountOutBase: amountIn.toBase(),
        },
      }),
    };

    const tx = await wallet.swap(
      {
        provider,
        chainId: ChainId.SEPOLIA,
        tokenIn: mockToken,
        tokenOut: mockToken,
        amountIn,
      },
      options
    );

    expect(wallet.executeSpy).toHaveBeenCalledWith([swapCall], options);
    expect(tx).toEqual({ hash: "0xtx" });
  });

  it("throws when provider swap returns no calls", async () => {
    const wallet = new TestWallet();
    const amountIn = Amount.parse("50", mockToken);

    const provider: SwapProvider = {
      id: "provider",
      supportsChain: () => true,
      getQuote: async () => ({
        amountInBase: amountIn.toBase(),
        amountOutBase: amountIn.toBase(),
      }),
      swap: async () => ({
        calls: [],
        quote: {
          amountInBase: amountIn.toBase(),
          amountOutBase: amountIn.toBase(),
        },
      }),
    };

    await expect(
      wallet.swap({
        provider,
        chainId: ChainId.SEPOLIA,
        tokenIn: mockToken,
        tokenOut: mockToken,
        amountIn,
      })
    ).rejects.toThrow('Swap provider "provider" returned no calls');
  });

  it("propagates provider swap errors", async () => {
    const wallet = new TestWallet();
    const amountIn = Amount.parse("50", mockToken);

    const provider: SwapProvider = {
      id: "provider",
      supportsChain: () => true,
      getQuote: async () => ({
        amountInBase: amountIn.toBase(),
        amountOutBase: amountIn.toBase(),
      }),
      swap: async () => {
        throw new Error("provider failed");
      },
    };

    await expect(
      wallet.swap({
        provider,
        chainId: ChainId.SEPOLIA,
        tokenIn: mockToken,
        tokenOut: mockToken,
        amountIn,
      })
    ).rejects.toThrow("provider failed");
  });

  it("supports getQuote(request) via default provider", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const quote = {
      amountInBase: amountIn.toBase(),
      amountOutBase: amountIn.toBase(),
      provider: "default",
    } as const;
    const provider: SwapProvider = {
      id: "default",
      supportsChain: () => true,
      getQuote: vi.fn().mockResolvedValue(quote),
      swap: vi.fn(),
    };
    const wallet = new TestWallet(provider);

    const response = await wallet.getQuote({
      chainId: ChainId.SEPOLIA,
      tokenIn: mockToken,
      tokenOut: mockToken,
      amountIn,
    });

    expect(provider.getQuote).toHaveBeenCalledTimes(1);
    expect(response).toEqual(quote);
  });

  it("auto-fills chainId and takerAddress from wallet when omitted", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const provider: SwapProvider = {
      id: "default",
      supportsChain: () => true,
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: amountIn.toBase(),
        amountOutBase: amountIn.toBase(),
        provider: "default",
      }),
      swap: vi.fn(),
    };
    const wallet = new TestWallet(provider);

    await wallet.getQuote({
      tokenIn: mockToken,
      tokenOut: mockToken,
      amountIn,
    });

    expect(provider.getQuote).toHaveBeenCalledTimes(1);
    const request = (provider.getQuote as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      chainId: ChainId;
      takerAddress?: string;
    };
    expect(request.chainId.toLiteral()).toBe(ChainId.SEPOLIA.toLiteral());
    expect(request.takerAddress).toBe(wallet.address);
  });

  it("supports swap(request, options) via default provider", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const options: ExecuteOptions = { feeMode: "sponsored" };
    const provider: SwapProvider = {
      id: "default",
      supportsChain: () => true,
      getQuote: vi.fn(),
      swap: vi.fn().mockResolvedValue({
        calls: [swapCall],
        quote: {
          amountInBase: amountIn.toBase(),
          amountOutBase: amountIn.toBase(),
        },
      }),
    };
    const wallet = new TestWallet(provider);

    const tx = await wallet.swap(
      {
        chainId: ChainId.SEPOLIA,
        tokenIn: mockToken,
        tokenOut: mockToken,
        amountIn,
      },
      options
    );

    expect(provider.swap).toHaveBeenCalledTimes(1);
    expect(wallet.executeSpy).toHaveBeenCalledWith([swapCall], options);
    expect(tx).toEqual({ hash: "0xtx" });
  });

  it("can register multiple providers and select default by id", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const avnuProvider: SwapProvider = {
      id: "avnu",
      supportsChain: () => true,
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: amountIn.toBase(),
        amountOutBase: 1n,
      }),
      swap: vi.fn(),
    };
    const ekuboProvider: SwapProvider = {
      id: "ekubo",
      supportsChain: () => true,
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: amountIn.toBase(),
        amountOutBase: 2n,
      }),
      swap: vi.fn(),
    };
    const wallet = new TestWallet(avnuProvider);

    wallet.registerSwapProvider(ekuboProvider);
    wallet.setDefaultSwapProvider("ekubo");

    const quote = await wallet.getQuote({
      chainId: ChainId.SEPOLIA,
      tokenIn: mockToken,
      tokenOut: mockToken,
      amountIn,
    });

    expect(quote.amountOutBase).toBe(2n);
    expect(wallet.listSwapProviders().sort()).toEqual(["avnu", "ekubo"]);
    expect(wallet.getSwapProvider("ekubo")).toBe(ekuboProvider);
  });

  it("supports provider id via request.provider", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const provider: SwapProvider = {
      id: "ekubo",
      supportsChain: () => true,
      getQuote: vi.fn().mockResolvedValue({
        amountInBase: amountIn.toBase(),
        amountOutBase: amountIn.toBase(),
      }),
      swap: vi.fn().mockResolvedValue({
        calls: [swapCall],
        quote: {
          amountInBase: amountIn.toBase(),
          amountOutBase: amountIn.toBase(),
        },
      }),
    };
    const wallet = new TestWallet();
    wallet.registerSwapProvider(provider);

    const quote = await wallet.getQuote({
      provider: "ekubo",
      chainId: ChainId.SEPOLIA,
      tokenIn: mockToken,
      tokenOut: mockToken,
      amountIn,
    });
    const tx = await wallet.swap({
      provider: "ekubo",
      chainId: ChainId.SEPOLIA,
      tokenIn: mockToken,
      tokenOut: mockToken,
      amountIn,
    });

    expect(provider.getQuote).toHaveBeenCalledTimes(1);
    expect(provider.swap).toHaveBeenCalledTimes(1);
    expect(quote.amountOutBase).toBe(amountIn.toBase());
    expect(tx).toEqual({ hash: "0xtx" });
  });

  it("throws when swap request chain does not match wallet chain", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const provider: SwapProvider = {
      id: "ekubo",
      supportsChain: () => true,
      getQuote: vi.fn(),
      swap: vi.fn(),
    };
    const wallet = new TestWallet(provider);

    await expect(
      wallet.swap({
        chainId: ChainId.MAINNET,
        tokenIn: mockToken,
        tokenOut: mockToken,
        amountIn,
      })
    ).rejects.toThrow("does not match wallet chain");
  });

  it("throws when provider does not support the swap chain", async () => {
    const amountIn = Amount.parse("50", mockToken);
    const provider: SwapProvider = {
      id: "unsupported",
      supportsChain: () => false,
      getQuote: vi.fn(),
      swap: vi.fn(),
    };
    const wallet = new TestWallet(provider);

    await expect(
      wallet.getQuote({
        chainId: ChainId.SEPOLIA,
        tokenIn: mockToken,
        tokenOut: mockToken,
        amountIn,
      })
    ).rejects.toThrow('Swap provider "unsupported" does not support chain');
  });
});
