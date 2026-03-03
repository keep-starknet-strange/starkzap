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
import type { LendingProvider } from "@/lending";
import type { Tx } from "@/tx";

const collateralToken: Token = {
  name: "Starknet Token",
  symbol: "STRK",
  decimals: 18,
  address: fromAddress(
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
  ),
};

const debtToken: Token = {
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress(
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
  ),
};

const lendingCall: Call = {
  contractAddress: fromAddress("0x123"),
  entrypoint: "modify_position",
  calldata: [1, 2, 3],
};

class TestWallet extends BaseWallet {
  readonly executeSpy = vi.fn<(...args: unknown[]) => Promise<Tx>>();
  readonly preflightSpy = vi.fn();

  constructor(defaultLendingProvider?: LendingProvider) {
    super(fromAddress("0xCAFE"), undefined, undefined, defaultLendingProvider);
    this.executeSpy.mockResolvedValue({ hash: "0xtx" } as Tx);
    this.preflightSpy.mockResolvedValue({ ok: true as const });
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

  async preflight(options: {
    calls: Call[];
    feeMode?: "sponsored" | "user_pays";
  }) {
    return this.preflightSpy(options);
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

function createProvider(
  overrides: Partial<LendingProvider> = {}
): LendingProvider {
  return {
    id: "provider",
    supportsChain: () => true,
    getMarkets: vi.fn().mockResolvedValue([]),
    prepareDeposit: vi.fn().mockResolvedValue({
      providerId: "provider",
      action: "deposit",
      calls: [lendingCall],
    }),
    prepareWithdraw: vi.fn().mockResolvedValue({
      providerId: "provider",
      action: "withdraw",
      calls: [lendingCall],
    }),
    prepareBorrow: vi.fn().mockResolvedValue({
      providerId: "provider",
      action: "borrow",
      calls: [lendingCall],
    }),
    prepareRepay: vi.fn().mockResolvedValue({
      providerId: "provider",
      action: "repay",
      calls: [lendingCall],
    }),
    getPosition: vi.fn().mockResolvedValue({
      collateralShares: 1n,
      nominalDebt: 0n,
      collateralValue: 1n,
      debtValue: 0n,
      isCollateralized: true,
    }),
    getHealth: vi.fn().mockResolvedValue({
      isCollateralized: true,
      collateralValue: 1n,
      debtValue: 0n,
    }),
    ...overrides,
  };
}

describe("BaseWallet lending abstraction", () => {
  it("executes lending calls with sponsored options", async () => {
    const provider = createProvider();
    const wallet = new TestWallet(provider);
    const amount = Amount.parse("100", debtToken);
    const options: ExecuteOptions = { feeMode: "sponsored" };

    const tx = await wallet.lending().deposit(
      {
        provider,
        token: debtToken,
        amount,
      },
      options
    );

    expect(provider.prepareDeposit).toHaveBeenCalledTimes(1);
    expect(wallet.executeSpy).toHaveBeenCalledWith([lendingCall], options);
    expect(tx).toEqual({ hash: "0xtx" });
  });

  it("executes lending calls with user_pays options", async () => {
    const provider = createProvider();
    const wallet = new TestWallet(provider);
    const amount = Amount.parse("10", debtToken);
    const options: ExecuteOptions = { feeMode: "user_pays" };

    await wallet.lending().repay(
      {
        provider,
        collateralToken,
        debtToken,
        amount,
      },
      options
    );

    expect(provider.prepareRepay).toHaveBeenCalledTimes(1);
    expect(wallet.executeSpy).toHaveBeenCalledWith([lendingCall], options);
  });

  it("runs quoteHealth simulation with selected fee mode", async () => {
    const provider = createProvider({
      getHealth: vi.fn().mockResolvedValue({
        isCollateralized: true,
        collateralValue: 200n,
        debtValue: 100n,
      }),
    });
    const wallet = new TestWallet(provider);

    const result = await wallet.lending().quoteHealth({
      action: {
        action: "borrow",
        request: {
          provider,
          collateralToken,
          debtToken,
          amount: Amount.parse("1", debtToken),
        },
      },
      health: {
        provider,
        collateralToken,
        debtToken,
      },
      feeMode: "sponsored",
    });

    expect(result.current.debtValue).toBe(100n);
    expect(result.prepared.calls).toEqual([lendingCall]);
    expect(wallet.preflightSpy).toHaveBeenCalledWith({
      calls: [lendingCall],
      feeMode: "sponsored",
    });
  });

  it("throws when provider does not support wallet chain", async () => {
    const provider = createProvider({
      id: "unsupported",
      supportsChain: () => false,
    });
    const wallet = new TestWallet(provider);

    await expect(
      wallet.lending().deposit({
        provider,
        token: debtToken,
        amount: Amount.parse("1", debtToken),
      })
    ).rejects.toThrow('Lending provider "unsupported" does not support chain');
  });
});
