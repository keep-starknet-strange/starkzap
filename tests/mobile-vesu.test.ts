import { describe, expect, it } from "vitest";
import type {
  LendingHealth,
  LendingMarket,
  LendingPosition,
  Token,
} from "@/types";
import {
  buildVesuAssetOptions,
  buildVesuMarketCards,
  formatVesuCompactUsd,
  formatVesuLtv,
  getVesuPoolVisual,
  formatVesuRate,
  formatVesuUsdValue,
  getAvailableVesuCollateralAssets,
  getDefaultVesuCollateralAsset,
  getVesuHealthStatus,
  getVesuPoolLabel,
  hasVesuExposure,
} from "../examples/mobile/vesu";

function createToken(
  symbol: string,
  address: string,
  decimals = 18,
  logoUrl?: string
): Token {
  return {
    symbol,
    name: symbol,
    address,
    decimals,
    ...(logoUrl
      ? {
          metadata: {
            logoUrl: new URL(logoUrl),
          },
        }
      : {}),
  } as Token;
}

function createMarket(
  token: Token,
  poolAddress: string,
  canBeBorrowed = true
): LendingMarket {
  return {
    protocol: "vesu",
    poolAddress,
    asset: token,
    vTokenAddress: `${token.address}-vtoken`,
    canBeBorrowed,
  } as unknown as LendingMarket;
}

const sepoliaChain = {
  isSepolia: () => true,
};

const mainnetChain = {
  isSepolia: () => false,
};

describe("mobile Vesu helpers", () => {
  it("builds market options with fallback assets for Sepolia", () => {
    const strk = createToken("STRK", "0xstrk");
    const usdc = createToken("USDC", "0xusdc", 6);
    const eth = createToken("ETH", "0xeth");

    const options = buildVesuAssetOptions({
      chainId: sepoliaChain,
      markets: [createMarket(usdc, "0xpool")],
      tokens: [strk, usdc, eth],
    });

    expect(options.map((option) => option.token.symbol)).toEqual([
      "USDC",
      "STRK",
    ]);
    expect(options[0]).toMatchObject({
      key: "0xpool:0xusdc",
      source: "market",
      canBorrow: true,
      poolAddress: "0xpool",
    });
    expect(options[1]).toMatchObject({
      key: strk.address,
      source: "fallback",
      canBorrow: false,
    });
  });

  it("keeps the fallback list minimal and marks only USDC as borrowable", () => {
    const strk = createToken("STRK", "0xstrk");
    const usdc = createToken("USDC", "0xusdc", 6);

    const options = buildVesuAssetOptions({
      chainId: mainnetChain,
      markets: [],
      tokens: [strk, usdc],
    });

    expect(options.map((option) => option.token.symbol)).toEqual([
      "USDC",
      "STRK",
    ]);
    expect(
      options.find((option) => option.token.symbol === "USDC")
    ).toMatchObject({
      canBorrow: true,
      source: "fallback",
    });
    expect(
      options.find((option) => option.token.symbol === "STRK")
    ).toMatchObject({
      canBorrow: false,
      source: "fallback",
    });
  });

  it("preserves different pools instead of collapsing by asset", () => {
    const usdc = createToken("USDC", "0xusdc", 6);
    const options = buildVesuAssetOptions({
      chainId: mainnetChain,
      markets: [createMarket(usdc, "0xpool-a"), createMarket(usdc, "0xpool-b")],
      tokens: [usdc],
    });

    expect(options.map((option) => option.key)).toEqual([
      "0xpool-a:0xusdc",
      "0xpool-b:0xusdc",
    ]);
    const cards = buildVesuMarketCards({
      options,
      apiMarkets: [],
      knownTokens: [usdc],
    });

    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((card) => card.key))).toEqual(
      new Set(["0xpool-a:0xusdc", "0xpool-b:0xusdc"])
    );
    expect(new Set(cards.map((card) => card.poolLabel))).toEqual(
      new Set([getVesuPoolLabel("0xpool-a"), getVesuPoolLabel("0xpool-b")])
    );
    expect(getVesuPoolLabel(undefined)).toBe("Pool unavailable");
  });

  it("builds deterministic pool visuals when the API has no explicit pool logo", () => {
    expect(getVesuPoolVisual("Prime")).toEqual({
      shortLabel: "V",
      backgroundColor: "#111827",
      foregroundColor: "#f8fafc",
    });
    expect(getVesuPoolVisual("Braavos Vault")).toEqual({
      shortLabel: "B",
      backgroundColor: "#1d4ed8",
      foregroundColor: "#eff6ff",
    });
    expect(getVesuPoolVisual("Pool unavailable")).toEqual({
      shortLabel: "?",
      backgroundColor: "#52525b",
      foregroundColor: "#fafafa",
    });
    expect(getVesuPoolVisual("My Custom Pool").shortLabel).toBe("MC");
  });

  it("builds Vesu market cards with live stats and same-pool collateral tokens", () => {
    const strk = createToken(
      "STRK",
      "0xstrk",
      18,
      "https://example.com/strk.png"
    );
    const usdc = createToken(
      "USDC",
      "0xusdc",
      6,
      "https://example.com/usdc.png"
    );
    const eth = createToken("ETH", "0xeth");
    const options = buildVesuAssetOptions({
      chainId: mainnetChain,
      markets: [
        createMarket(usdc, "0xpool-a"),
        createMarket(strk, "0xpool-a", false),
        createMarket(eth, "0xpool-b"),
      ],
      tokens: [strk, usdc, eth],
    });

    const cards = buildVesuMarketCards({
      options,
      apiMarkets: [
        {
          address: usdc.address,
          pool: { id: "0xpool-a", name: "Genesis Pool" },
          stats: {
            canBeBorrowed: true,
            totalSupplied: { value: "292000000", decimals: 2 },
            totalDebt: { value: "142000000", decimals: 2 },
            supplyApy: { value: "197", decimals: 4 },
            borrowApr: { value: "506", decimals: 4 },
          },
        },
      ],
      knownTokens: [strk, usdc, eth],
    });

    expect(cards[0]).toMatchObject({
      key: "0xpool-a:0xusdc",
      poolLabel: "Genesis Pool",
      totalSuppliedLabel: "$2.92M",
      totalBorrowedLabel: "$1.42M",
      supplyAprLabel: "1.97%",
      borrowAprLabel: "5.06%",
    });
    expect(cards[0]?.collateralTokens.map((token) => token.symbol)).toEqual([
      "STRK",
    ]);
    expect(cards[0]?.option.token.metadata?.logoUrl?.toString()).toBe(
      "https://example.com/usdc.png"
    );
    expect(cards[0]?.collateralTokens[0]?.metadata?.logoUrl?.toString()).toBe(
      "https://example.com/strk.png"
    );
  });

  it("reuses known token logos for Vesu display tokens even when addresses differ", () => {
    const knownUsdc = createToken(
      "USDC",
      "0xknown-usdc",
      6,
      "https://example.com/known-usdc.png"
    );
    const knownStrk = createToken(
      "STRK",
      "0xknown-strk",
      18,
      "https://example.com/known-strk.png"
    );
    const marketUsdc = createToken("USDC", "0xmarket-usdc", 6);
    const marketStrk = createToken("STRK", "0xmarket-strk");

    const options = buildVesuAssetOptions({
      chainId: mainnetChain,
      markets: [
        createMarket(marketUsdc, "0xpool-a"),
        createMarket(marketStrk, "0xpool-a", false),
      ],
      tokens: [knownUsdc, knownStrk],
    });

    const cards = buildVesuMarketCards({
      options,
      apiMarkets: [],
      knownTokens: [knownUsdc, knownStrk],
    });

    expect(cards[0]?.option.token.address).toBe("0xmarket-usdc");
    expect(cards[0]?.option.token.metadata?.logoUrl?.toString()).toBe(
      "https://example.com/known-usdc.png"
    );
    expect(cards[0]?.collateralTokens[0]?.address).toBe("0xmarket-strk");
    expect(cards[0]?.collateralTokens[0]?.metadata?.logoUrl?.toString()).toBe(
      "https://example.com/known-strk.png"
    );
  });

  it("prioritizes collateral assets and excludes the selected debt asset", () => {
    const strk = createToken("STRK", "0xstrk");
    const usdc = createToken("USDC", "0xusdc", 6);
    const wbtc = createToken("WBTC", "0xwbtc", 8);

    const assetOptions = [
      {
        key: "0xpool-a:0xstrk",
        token: strk,
        poolAddress: "0xpool-a",
        canBorrow: false,
        source: "market",
      },
      {
        key: "0xpool-a:0xusdc",
        token: usdc,
        poolAddress: "0xpool-a",
        canBorrow: true,
        source: "market",
      },
      {
        key: "0xpool-b:0xwbtc",
        token: wbtc,
        poolAddress: "0xpool-b",
        canBorrow: false,
        source: "market",
      },
    ] as const;
    const debtAsset = assetOptions[1];
    const options = getAvailableVesuCollateralAssets(
      assetOptions.slice(),
      debtAsset
    );

    expect(options.map((option) => option.token.symbol)).toEqual(["STRK"]);
    expect(
      getDefaultVesuCollateralAsset(assetOptions.slice(), debtAsset)?.token
        .symbol
    ).toBe("STRK");
  });

  it("formats USD values and LTV for display", () => {
    const health: LendingHealth = {
      isCollateralized: true,
      collateralValue: 200n * 10n ** 18n,
      debtValue: 50n * 10n ** 18n,
    };

    expect(formatVesuUsdValue(1234n * 10n ** 18n + 56n * 10n ** 16n)).toBe(
      "$1,234.56"
    );
    expect(formatVesuCompactUsd({ value: "230000000", decimals: 2 })).toBe(
      "$2.3M"
    );
    expect(formatVesuRate({ value: "240", decimals: 4 })).toBe("2.4%");
    expect(formatVesuUsdValue(null)).toBe("—");
    expect(formatVesuLtv(health)).toBe("25.00%");
    expect(
      formatVesuLtv({
        isCollateralized: false,
        collateralValue: 0n,
        debtValue: 0n,
      })
    ).toBe("0.00%");
  });

  it("reports health status from the current position", () => {
    const healthy: LendingHealth = {
      isCollateralized: true,
      collateralValue: 100n,
      debtValue: 10n,
    };
    const atRisk: LendingHealth = {
      isCollateralized: false,
      collateralValue: 100n,
      debtValue: 110n,
    };
    const openPosition: LendingPosition = {
      collateralShares: 1n,
      nominalDebt: 0n,
      collateralAmount: 5n,
      debtAmount: 0n,
      collateralValue: 0n,
      debtValue: 0n,
      isCollateralized: true,
    };

    expect(hasVesuExposure(null)).toBe(false);
    expect(hasVesuExposure(openPosition)).toBe(true);
    expect(getVesuHealthStatus(null, openPosition)).toBe("Loading");
    expect(getVesuHealthStatus(healthy, null)).toBe("No open position");
    expect(getVesuHealthStatus(healthy, openPosition)).toBe("Healthy");
    expect(getVesuHealthStatus(atRisk, openPosition)).toBe("At risk");
  });
});
