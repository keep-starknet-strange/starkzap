import { describe, expect, it } from "vitest";
import {
  buildFallbackWebVesuMarkets,
  buildWebVesuDebtOptions,
  buildWebVesuMarketOptions,
  getWebVesuPoolLabel,
} from "../examples/web/vesu";

const strk = {
  address: "0xstrk",
  symbol: "STRK",
  decimals: 18,
  name: "Starknet Token",
};

const usdc = {
  address: "0xusdc",
  symbol: "USDC",
  decimals: 6,
  name: "USD Coin",
};

const eth = {
  address: "0xeth",
  symbol: "ETH",
  decimals: 18,
  name: "Ether",
};

describe("web Vesu helpers", () => {
  it("builds market labels with pool-aware keys", () => {
    const options = buildWebVesuMarketOptions([
      {
        poolAddress: "0xpool-a",
        poolName: "Prime",
        asset: strk,
        canBeBorrowed: false,
      },
      {
        poolAddress: "0xpool-b",
        asset: usdc,
      },
    ]);

    expect(options.map((option) => option.key)).toEqual([
      "0xpool-a:0xstrk",
      "0xpool-b:0xusdc",
    ]);
    expect(options[0]?.label).toBe("STRK · Prime");
    expect(options[1]?.poolLabel).toBe("Pool 0xpool...ol-b");
  });

  it("limits debt options to borrowable assets from the same pool", () => {
    const markets = [
      {
        poolAddress: "0xpool-a",
        asset: strk,
        canBeBorrowed: false,
      },
      {
        poolAddress: "0xpool-a",
        asset: usdc,
        canBeBorrowed: true,
      },
      {
        poolAddress: "0xpool-b",
        asset: eth,
        canBeBorrowed: true,
      },
      {
        poolAddress: "0xpool-a",
        asset: usdc,
        canBeBorrowed: true,
      },
    ];

    const collateralKey = "0xpool-a:0xstrk";
    const debtOptions = buildWebVesuDebtOptions(markets, collateralKey);

    expect(debtOptions).toHaveLength(1);
    expect(debtOptions[0]?.key).toBe("0xpool-a:0xusdc");
  });

  it("keeps fallback markets explicit and minimal", () => {
    const fallback = buildFallbackWebVesuMarkets([strk, usdc, eth]);

    expect(fallback).toEqual([
      { asset: strk, canBeBorrowed: false },
      { asset: usdc, canBeBorrowed: true },
    ]);
  });

  it("formats missing pool labels consistently", () => {
    expect(getWebVesuPoolLabel(undefined)).toBe("Pool unavailable");
  });
});
