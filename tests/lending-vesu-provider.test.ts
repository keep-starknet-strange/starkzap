import { afterEach, describe, expect, it, vi } from "vitest";
import { ChainId, Amount, fromAddress, type Token } from "@/types";
import { VesuLendingProvider, vesuPresets } from "@/lending/vesu";
import type { LendingProviderContext } from "@/lending";
import type { RpcProvider } from "starknet";

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

function toU256Words(value: bigint): [string, string] {
  const mask = (1n << 128n) - 1n;
  const low = value & mask;
  const high = value >> 128n;
  return [low.toString(), high.toString()];
}

function createContext(
  callContract: ReturnType<typeof vi.fn>
): LendingProviderContext {
  return {
    chainId: ChainId.MAINNET,
    provider: {
      callContract,
    } as unknown as RpcProvider,
    walletAddress: fromAddress("0xCAFE"),
  };
}

describe("VesuLendingProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports mainnet by default and requires config for sepolia", () => {
    const provider = new VesuLendingProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(false);
  });

  it("builds deposit calls using vToken lookup", async () => {
    const callContract = vi.fn().mockResolvedValue([fromAddress("0x1234")]);
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const prepared = await provider.prepareDeposit(context, {
      token: debtToken,
      amount: Amount.parse("10", debtToken),
    });

    expect(callContract).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: vesuPresets.SN_MAIN.poolFactory,
        entrypoint: "v_token_for_asset",
      })
    );
    expect(prepared.calls).toHaveLength(2);
    expect(prepared.calls[0]!.contractAddress).toBe(debtToken.address);
    expect(prepared.calls[0]!.entrypoint).toBe("approve");
    expect(prepared.calls[1]!.contractAddress).toBe(fromAddress("0x1234"));
    expect(prepared.calls[1]!.entrypoint).toBe("deposit");
  });

  it("builds repay as approve + modify_position", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const prepared = await provider.prepareRepay(context, {
      poolAddress: fromAddress("0x999"),
      collateralToken,
      debtToken,
      amount: Amount.parse("5", debtToken),
    });

    expect(prepared.calls).toHaveLength(2);
    expect(prepared.calls[0]!.entrypoint).toBe("approve");
    expect(prepared.calls[0]!.contractAddress).toBe(debtToken.address);
    expect(prepared.calls[1]!.entrypoint).toBe("modify_position");
    expect(prepared.calls[1]!.contractAddress).toBe(fromAddress("0x999"));
    expect(callContract).not.toHaveBeenCalled();
  });

  it("builds borrow with collateral + debt deltas", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const prepared = await provider.prepareBorrow(context, {
      poolAddress: fromAddress("0x999"),
      collateralToken,
      debtToken,
      collateralAmount: Amount.parse("600", collateralToken),
      amount: Amount.parse("11", debtToken),
    });

    expect(prepared.calls).toHaveLength(2);
    expect(prepared.calls[0]!.entrypoint).toBe("approve");
    expect(prepared.calls[0]!.contractAddress).toBe(collateralToken.address);
    expect(prepared.calls[1]!.entrypoint).toBe("modify_position");
    expect(prepared.calls[1]!.contractAddress).toBe(fromAddress("0x999"));
    expect(callContract).not.toHaveBeenCalled();
  });

  it("builds repay-only-collateral-withdraw without approve when debt amount is zero", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const prepared = await provider.prepareRepay(context, {
      poolAddress: fromAddress("0x999"),
      collateralToken,
      debtToken,
      amount: Amount.parse("0", debtToken),
      collateralAmount: Amount.parse("1", collateralToken),
      withdrawCollateral: true,
    });

    expect(prepared.calls).toHaveLength(1);
    expect(prepared.calls[0]!.entrypoint).toBe("modify_position");
    expect(prepared.calls[0]!.contractAddress).toBe(fromAddress("0x999"));
    expect(callContract).not.toHaveBeenCalled();
  });

  it("parses position + health responses", async () => {
    const positionResult = [
      ...toU256Words(900n),
      ...toU256Words(90n),
      ...toU256Words(9000n),
      ...toU256Words(3000n),
    ];
    const healthResult = ["1", ...toU256Words(9000n), ...toU256Words(3000n)];
    const callContract = vi
      .fn()
      .mockResolvedValueOnce(positionResult)
      .mockResolvedValueOnce(healthResult);
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const position = await provider.getPosition(context, {
      collateralToken,
      debtToken,
    });

    expect(position.collateralShares).toBe(900n);
    expect(position.nominalDebt).toBe(90n);
    expect(position.collateralValue).toBe(9000n);
    expect(position.debtValue).toBe(3000n);
    expect(position.isCollateralized).toBe(true);
  });

  it("parses health responses", async () => {
    const healthResult = ["0", ...toU256Words(500n), ...toU256Words(900n)];
    const callContract = vi.fn().mockResolvedValue(healthResult);
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const health = await provider.getHealth(context, {
      collateralToken,
      debtToken,
    });

    expect(health.isCollateralized).toBe(false);
    expect(health.collateralValue).toBe(500n);
    expect(health.debtValue).toBe(900n);
  });

  it("maps markets from API payload", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            pool: { id: "0x999" },
            address: debtToken.address,
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
            vToken: { address: "0x1234", symbol: "vUSDC" },
            stats: { canBeBorrowed: true },
          },
        ],
      }),
    });
    const provider = new VesuLendingProvider({
      fetcher: fetcher as typeof fetch,
    });

    const markets = await provider.getMarkets(ChainId.MAINNET);

    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({
      protocol: "vesu",
      poolAddress: fromAddress("0x999"),
      vTokenAddress: fromAddress("0x1234"),
      canBeBorrowed: true,
    });
    expect(fetcher).toHaveBeenCalledWith("https://api.vesu.xyz/markets");
  });
});
