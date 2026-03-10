import { afterEach, describe, expect, it, vi } from "vitest";
import { ChainId, Amount, fromAddress } from "@/types";
import { VesuLendingProvider, vesuPresets } from "@/lending/vesu";
import type { LendingProviderContext } from "@/lending";
import type { RpcProvider } from "starknet";
import {
  testLendingCollateralToken as collateralToken,
  testLendingDebtToken as debtToken,
} from "./fixtures/lending";

function toU256Words(value: bigint): [string, string] {
  const mask = (1n << 128n) - 1n;
  const low = value & mask;
  const high = value >> 128n;
  return [low.toString(), high.toString()];
}

function createContext(
  callContract: ReturnType<typeof vi.fn>,
  chainId: ChainId = ChainId.MAINNET
): LendingProviderContext {
  return {
    chainId,
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

  it("supports mainnet and sepolia by default", () => {
    const provider = new VesuLendingProvider();

    expect(provider.supportsChain(ChainId.MAINNET)).toBe(true);
    expect(provider.supportsChain(ChainId.SEPOLIA)).toBe(true);
  });

  it("throws on deposit when chain has no poolFactory configured", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider({
      chainConfigs: {
        SN_SEPOLIA: {
          poolFactory: null,
        },
      },
    });
    const context = createContext(callContract, ChainId.SEPOLIA);

    await expect(
      provider.prepareDeposit(context, {
        token: debtToken,
        amount: Amount.parse("1", debtToken),
      })
    ).rejects.toThrow(
      'Vesu chain "SN_SEPOLIA" has no poolFactory configured. Required for deposit/withdraw vToken resolution.'
    );
    expect(callContract).not.toHaveBeenCalled();
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

  it("rejects delegated withdraw owner overrides", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareWithdraw(context, {
        token: debtToken,
        amount: Amount.parse("1", debtToken),
        owner: fromAddress("0xBEEF"),
      })
    ).rejects.toThrow(
      "Vesu delegated withdrawals are not yet supported; owner must match wallet address"
    );
    expect(callContract).not.toHaveBeenCalled();
  });

  it("rejects delegated withdrawMax owner overrides", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareWithdrawMax(context, {
        token: debtToken,
        owner: fromAddress("0xBEEF"),
      })
    ).rejects.toThrow(
      "Vesu delegated withdrawals are not yet supported; owner must match wallet address"
    );
    expect(callContract).not.toHaveBeenCalled();
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

  it("builds withdraw-max using max_redeem + redeem", async () => {
    const callContract = vi
      .fn()
      .mockResolvedValueOnce([fromAddress("0x1234")])
      .mockResolvedValueOnce(toU256Words(777n));
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const prepared = await provider.prepareWithdrawMax(context, {
      token: debtToken,
    });

    expect(callContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contractAddress: vesuPresets.SN_MAIN.poolFactory,
        entrypoint: "v_token_for_asset",
      })
    );
    expect(callContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contractAddress: fromAddress("0x1234"),
        entrypoint: "max_redeem",
      })
    );
    expect(prepared.calls).toHaveLength(1);
    expect(prepared.calls[0]!.entrypoint).toBe("redeem");
    expect(prepared.calls[0]!.contractAddress).toBe(fromAddress("0x1234"));
  });

  it("throws when withdraw-max has zero redeemable shares", async () => {
    const callContract = vi
      .fn()
      .mockResolvedValueOnce([fromAddress("0x1234")])
      .mockResolvedValueOnce(toU256Words(0n));
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareWithdrawMax(context, {
        token: debtToken,
      })
    ).rejects.toThrow("No withdrawable Vesu shares for this position");
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

  it("rejects delegated borrow user overrides", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareBorrow(context, {
        poolAddress: fromAddress("0x999"),
        collateralToken,
        debtToken,
        amount: Amount.parse("1", debtToken),
        user: fromAddress("0xBEEF"),
      })
    ).rejects.toThrow(
      "Vesu delegated borrow is not yet supported; user must match wallet address"
    );
    expect(callContract).not.toHaveBeenCalled();
  });

  it("rejects native denomination in borrow", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareBorrow(context, {
        poolAddress: fromAddress("0x999"),
        collateralToken,
        debtToken,
        collateralAmount: Amount.parse("1", collateralToken),
        amount: Amount.parse("1", debtToken),
        collateralDenomination: "native",
      })
    ).rejects.toThrow(
      'Vesu borrow currently supports only "assets" denomination for collateral'
    );
  });

  it("rejects native denomination in repay", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareRepay(context, {
        poolAddress: fromAddress("0x999"),
        collateralToken,
        debtToken,
        amount: Amount.parse("1", debtToken),
        debtDenomination: "native",
      })
    ).rejects.toThrow(
      'Vesu repay currently supports only "assets" denomination for debt'
    );
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

  it("rejects delegated repay user overrides", async () => {
    const callContract = vi.fn();
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareRepay(context, {
        poolAddress: fromAddress("0x999"),
        collateralToken,
        debtToken,
        amount: Amount.parse("1", debtToken),
        user: fromAddress("0xBEEF"),
      })
    ).rejects.toThrow(
      "Vesu delegated repay is not yet supported; user must match wallet address"
    );
    expect(callContract).not.toHaveBeenCalled();
  });

  it("parses position + health responses", async () => {
    const positionResult = [
      ...toU256Words(900n),
      ...toU256Words(90n),
      ...toU256Words(9100n),
      ...toU256Words(3100n),
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
    expect(position.collateralAmount).toBe(9100n);
    expect(position.debtAmount).toBe(3100n);
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

  it("quotes projected health for borrow/repay deltas", async () => {
    const callContract = vi
      .fn()
      .mockResolvedValueOnce([...toU256Words(1000n), "1"])
      .mockResolvedValueOnce([...toU256Words(500n), "1"])
      .mockResolvedValueOnce(["700000000000000000", "0", "0"]);
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const projected = await provider.quoteProjectedHealth(
      context,
      {
        action: {
          action: "borrow",
          request: {
            collateralToken,
            debtToken,
            collateralAmount: Amount.parse("1", collateralToken),
            amount: Amount.parse("2", debtToken),
          },
        },
        health: {
          collateralToken,
          debtToken,
        },
      },
      {
        isCollateralized: true,
        collateralValue: 9000n,
        debtValue: 3000n,
      }
    );

    expect(projected).toEqual({
      isCollateralized: true,
      collateralValue: 10000n,
      debtValue: 4000n,
    });
  });

  it("returns null for unsupported projected health actions", async () => {
    const provider = new VesuLendingProvider();
    const projected = await provider.quoteProjectedHealth(
      createContext(vi.fn()),
      {
        action: {
          action: "deposit",
          request: {
            token: debtToken,
            amount: Amount.parse("1", debtToken),
          },
        },
        health: {
          collateralToken,
          debtToken,
        },
      },
      {
        isCollateralized: true,
        collateralValue: 100n,
        debtValue: 50n,
      }
    );

    expect(projected).toBeNull();
  });

  it("uses conservative rounding for negative projected deltas", async () => {
    const callContract = vi
      .fn()
      .mockResolvedValueOnce([...toU256Words(1n), "1"])
      .mockResolvedValueOnce([...toU256Words(1n), "1"])
      .mockResolvedValueOnce(["1000000000000000000"]);
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    const projected = await provider.quoteProjectedHealth(
      context,
      {
        action: {
          action: "repay",
          request: {
            collateralToken,
            debtToken,
            collateralAmount: Amount.parse(
              "0.000000000000000001",
              collateralToken
            ),
            amount: Amount.parse("0.000001", debtToken),
            withdrawCollateral: true,
          },
        },
        health: {
          collateralToken,
          debtToken,
        },
      },
      {
        isCollateralized: true,
        collateralValue: 10n,
        debtValue: 10n,
      }
    );

    expect(projected).toEqual({
      isCollateralized: false,
      collateralValue: 9n,
      debtValue: 10n,
    });
  });

  it("maps markets from API payload", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            protocolVersion: "v1",
            pool: { id: "0x998", isDeprecated: true },
            address: debtToken.address,
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
            vToken: { address: "0x1111", symbol: "vUSDC-old" },
            stats: { canBeBorrowed: true },
          },
          {
            protocolVersion: "v2",
            pool: { id: "0x997", isDeprecated: true },
            address: debtToken.address,
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
            vToken: { address: "0x2222", symbol: "vUSDC-deprecated" },
            stats: { canBeBorrowed: true },
          },
          {
            protocolVersion: "v2",
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

  it("throws when vToken lookup returns zero address", async () => {
    const callContract = vi.fn().mockResolvedValue(["0x0"]);
    const provider = new VesuLendingProvider();
    const context = createContext(callContract);

    await expect(
      provider.prepareDeposit(context, {
        token: debtToken,
        amount: Amount.parse("1", debtToken),
      })
    ).rejects.toThrow("Unable to resolve Vesu vToken for asset");
  });
});
