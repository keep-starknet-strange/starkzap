import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Amount, tokenAmountToFormatted } from "@/types";
import type { Token } from "@/types";
import type { Address } from "@/types";

// Mock Intl.NumberFormat to use 'en-US' locale for deterministic test output
const OriginalNumberFormat = Intl.NumberFormat;

beforeAll(() => {
  vi.spyOn(Intl, "NumberFormat").mockImplementation((locales, options) => {
    // Force 'en-US' locale regardless of what's passed (including 'default')
    return new OriginalNumberFormat("en-US", options);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Non-breaking space used by Intl.NumberFormat between currency code and number
const NBSP = "\u00A0";

// Mock tokens for testing
const mockETH: Token = {
  name: "Ethereum",
  address:
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7" as Address,
  decimals: 18,
  symbol: "ETH",
};

const mockUSDC: Token = {
  name: "USD Coin",
  address:
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8" as Address,
  decimals: 6,
  symbol: "USDC",
};

const mockBTC: Token = {
  name: "Bitcoin",
  address:
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac" as Address,
  decimals: 8,
  symbol: "BTC",
};

describe("Amount", () => {
  describe("parse", () => {
    describe("with string input", () => {
      it("should create amount from integer string", () => {
        const amount = Amount.parse("10", 18, "ETH");
        expect(amount.toBase()).toBe(10000000000000000000n);
        expect(amount.toUnit()).toBe("10");
      });

      it("should create amount from decimal string", () => {
        const amount = Amount.parse("1.5", 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should create amount from string with many decimal places", () => {
        const amount = Amount.parse("0.123456789012345678", 18, "ETH");
        expect(amount.toBase()).toBe(123456789012345678n);
        expect(amount.toUnit()).toBe("0.123456789012345678");
      });

      it("should handle zero", () => {
        const amount = Amount.parse("0", 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should handle string with leading zeros", () => {
        const amount = Amount.parse("0.001", 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000n);
        expect(amount.toUnit()).toBe("0.001");
      });

      it("should handle very small decimal values", () => {
        const amount = Amount.parse("0.000000000000000001", 18, "ETH");
        expect(amount.toBase()).toBe(1n);
        expect(amount.toUnit()).toBe("0.000000000000000001");
      });
    });

    describe("with number input", () => {
      it("should create amount from integer number", () => {
        const amount = Amount.parse(10, 18, "ETH");
        expect(amount.toBase()).toBe(10000000000000000000n);
        expect(amount.toUnit()).toBe("10");
      });

      it("should create amount from decimal number", () => {
        const amount = Amount.parse(1.5, 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should handle zero as number", () => {
        const amount = Amount.parse(0, 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should reject unsafe decimal numbers", () => {
        expect(() => Amount.parse(0.1 + 0.2, 18, "ETH")).toThrow(
          "cannot safely represent this decimal"
        );
      });
    });

    describe("with bigint input", () => {
      it("should treat bigint as whole units", () => {
        const amount = Amount.parse(10n, 18, "ETH");
        expect(amount.toBase()).toBe(10000000000000000000n);
        expect(amount.toUnit()).toBe("10");
      });

      it("should handle zero bigint", () => {
        const amount = Amount.parse(0n, 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should handle large bigint values", () => {
        const amount = Amount.parse(1000000n, 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000000000000n);
        expect(amount.toUnit()).toBe("1000000");
      });
    });

    describe("with different decimals", () => {
      it("should work with 6 decimals (USDC-like)", () => {
        const amount = Amount.parse("100.5", 6, "USDC");
        expect(amount.toBase()).toBe(100500000n);
        expect(amount.toUnit()).toBe("100.5");
      });

      it("should work with 8 decimals (BTC-like)", () => {
        const amount = Amount.parse("0.5", 8, "BTC");
        expect(amount.toBase()).toBe(50000000n);
        expect(amount.toUnit()).toBe("0.5");
      });

      it("should work with 0 decimals", () => {
        const amount = Amount.parse("100", 0, "TOKEN");
        expect(amount.toBase()).toBe(100n);
        expect(amount.toUnit()).toBe("100");
      });

      it("should work with 2 decimals (cent-based)", () => {
        const amount = Amount.parse("99.99", 2, "USD");
        expect(amount.toBase()).toBe(9999n);
        expect(amount.toUnit()).toBe("99.99");
      });

      it("should parse scientific notation strings", () => {
        const amount = Amount.parse("1e3", 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000000000n);
        expect(amount.toUnit()).toBe("1000");
      });
    });

    describe("error handling", () => {
      it("should throw on negative number", () => {
        expect(() => Amount.parse("-1", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on negative decimal", () => {
        expect(() => Amount.parse("-0.5", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on non-numeric string", () => {
        expect(() => Amount.parse("abc", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on string with letters", () => {
        expect(() => Amount.parse("10ETH", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on empty string", () => {
        expect(() => Amount.parse("", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on precision overflow", () => {
        expect(() => Amount.parse("1.1234567", 6, "USDC")).toThrow(
          "Precision overflow"
        );
      });

      it("should throw on invalid decimals argument", () => {
        expect(() => Amount.parse("1", -1, "ETH")).toThrow("Invalid decimals");
        expect(() => Amount.parse("1", Number.NaN, "ETH")).toThrow(
          "Invalid decimals"
        );
      });

      it("should throw when exceeding 18 decimals", () => {
        expect(() => Amount.parse("0.0000000000000000001", 18, "ETH")).toThrow(
          "Precision overflow"
        );
      });

      it("should throw on string with spaces", () => {
        expect(() => Amount.parse(" 10 ", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on string with commas", () => {
        expect(() => Amount.parse("1,000", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on multiple decimal points", () => {
        expect(() => Amount.parse("1.5.5", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });
    });
  });

  describe("fromRaw", () => {
    describe("with bigint input", () => {
      it("should create amount from bigint", () => {
        const amount = Amount.fromRaw(1500000000000000000n, 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should handle zero", () => {
        const amount = Amount.fromRaw(0n, 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should handle very large values", () => {
        const amount = Amount.fromRaw(1000000000000000000000000n, 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000000000000n);
        expect(amount.toUnit()).toBe("1000000");
      });

      it("should handle small values (less than 1 unit)", () => {
        const amount = Amount.fromRaw(500000000000000n, 18, "ETH");
        expect(amount.toBase()).toBe(500000000000000n);
        expect(amount.toUnit()).toBe("0.0005");
      });
    });

    describe("with string input", () => {
      it("should create amount from numeric string", () => {
        const amount = Amount.fromRaw("1500000000000000000", 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should handle hex string", () => {
        const amount = Amount.fromRaw("0x14D1120D7B160000", 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });
    });

    describe("with number input", () => {
      it("should create amount from integer number", () => {
        const amount = Amount.fromRaw(1000000, 6, "USDC");
        expect(amount.toBase()).toBe(1000000n);
        expect(amount.toUnit()).toBe("1");
      });

      it("should reject unsafe integer numbers", () => {
        expect(() =>
          Amount.fromRaw(Number.MAX_SAFE_INTEGER + 1, 6, "USDC")
        ).toThrow("safe integers");
      });
    });

    describe("with different decimals", () => {
      it("should work with 6 decimals", () => {
        const amount = Amount.fromRaw(100500000n, 6, "USDC");
        expect(amount.toUnit()).toBe("100.5");
      });

      it("should work with 8 decimals", () => {
        const amount = Amount.fromRaw(50000000n, 8, "BTC");
        expect(amount.toUnit()).toBe("0.5");
      });

      it("should work with 0 decimals", () => {
        const amount = Amount.fromRaw(100n, 0, "TOKEN");
        expect(amount.toUnit()).toBe("100");
      });
    });
  });

  describe("parse with Token", () => {
    it("should use token decimals and symbol", () => {
      const amount = Amount.parse("1.5", mockETH);
      expect(amount.toBase()).toBe(1500000000000000000n);
      expect(amount.toUnit()).toBe("1.5");
    });

    it("should work with USDC token (6 decimals)", () => {
      const amount = Amount.parse("100", mockUSDC);
      expect(amount.toBase()).toBe(100000000n);
      expect(amount.toUnit()).toBe("100");
    });

    it("should work with BTC token (8 decimals)", () => {
      const amount = Amount.parse("0.5", mockBTC);
      expect(amount.toBase()).toBe(50000000n);
      expect(amount.toUnit()).toBe("0.5");
    });

    it("should throw on precision overflow for token", () => {
      expect(() => Amount.parse("1.1234567", mockUSDC)).toThrow(
        "Precision overflow"
      );
    });
  });

  describe("fromRaw with Token", () => {
    it("should use token decimals and symbol", () => {
      const amount = Amount.fromRaw(1500000000000000000n, mockETH);
      expect(amount.toBase()).toBe(1500000000000000000n);
      expect(amount.toUnit()).toBe("1.5");
    });

    it("should work with USDC token", () => {
      const amount = Amount.fromRaw(100000000n, mockUSDC);
      expect(amount.toUnit()).toBe("100");
    });

    it("should work with BTC token", () => {
      const amount = Amount.fromRaw(50000000n, mockBTC);
      expect(amount.toUnit()).toBe("0.5");
    });
  });

  describe("toBase", () => {
    it("should return exact bigint value", () => {
      const amount = Amount.parse("1.5", 18, "ETH");
      expect(amount.toBase()).toBe(1500000000000000000n);
    });

    it("should be idempotent", () => {
      const amount = Amount.parse("1.5", 18, "ETH");
      expect(amount.toBase()).toBe(amount.toBase());
    });

    it("should preserve precision through round-trip", () => {
      const originalBase = 123456789012345678n;
      const amount = Amount.fromRaw(originalBase, 18, "ETH");
      expect(amount.toBase()).toBe(originalBase);
    });
  });

  describe("toUnit", () => {
    it("should strip trailing zeros", () => {
      const amount = Amount.fromRaw(1000000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("1");
    });

    it("should preserve non-trailing zeros", () => {
      const amount = Amount.fromRaw(1001000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("1.001");
    });

    it("should handle values less than 1", () => {
      const amount = Amount.fromRaw(100000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("0.1");
    });

    it("should handle very small values", () => {
      const amount = Amount.fromRaw(1n, 18, "ETH");
      expect(amount.toUnit()).toBe("0.000000000000000001");
    });

    it("should handle exact integer amounts", () => {
      const amount = Amount.parse("100", 18, "ETH");
      expect(amount.toUnit()).toBe("100");
    });

    it("should be idempotent", () => {
      const amount = Amount.parse("1.5", 18, "ETH");
      expect(amount.toUnit()).toBe(amount.toUnit());
    });
  });

  describe("toFormatted", () => {
    it("should format amount with symbol", () => {
      const amount = Amount.parse("1.5", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}1.5`);
    });

    it("should format amount without symbol", () => {
      const amount = Amount.parse("1.5", 18);
      expect(amount.toFormatted()).toBe(`${NBSP}1.5`);
    });

    it("should compress decimals when compressed is true", () => {
      const amount = Amount.parse("1.123456789", 18, "ETH");
      expect(amount.toFormatted(true)).toBe(`ETH${NBSP}1.1235`);
      expect(amount.toFormatted(false)).toBe(`ETH${NBSP}1.123456789`);
    });

    it("should handle zero amount", () => {
      const amount = Amount.parse("0", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}0`);
    });

    it("should handle large numbers with thousand separators", () => {
      const amount = Amount.parse("1000000", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}1,000,000`);
    });

    it("should handle amounts with many decimal places", () => {
      const amount = Amount.parse("1.123456789012345678", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}1.123456789012345678`);
    });

    it("should handle small fractional amounts", () => {
      const amount = Amount.parse("0.001", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}0.001`);
    });
  });

  describe("round-trip conversions", () => {
    it("should preserve value through unit -> base -> unit", () => {
      const original = "1.5";
      const amount = Amount.parse(original, 18, "ETH");
      expect(amount.toUnit()).toBe(original);
    });

    it("should preserve value through base -> unit -> base", () => {
      const originalBase = 1500000000000000000n;
      const amount = Amount.fromRaw(originalBase, 18, "ETH");
      const unitValue = amount.toUnit();
      const recreated = Amount.parse(unitValue, 18, "ETH");
      expect(recreated.toBase()).toBe(originalBase);
    });

    it("should handle precision at boundary", () => {
      // Maximum precision for 18 decimals
      const original = "1.123456789012345678";
      const amount = Amount.parse(original, 18, "ETH");
      expect(amount.toUnit()).toBe(original);
    });

    it("should handle very large amounts", () => {
      const original = "999999999999999999";
      const amount = Amount.parse(original, 18, "ETH");
      expect(amount.toUnit()).toBe(original);
    });
  });

  describe("edge cases", () => {
    it("should handle 1 wei correctly", () => {
      const amount = Amount.fromRaw(1n, 18, "ETH");
      expect(amount.toUnit()).toBe("0.000000000000000001");
    });

    it("should handle maximum safe integer boundary", () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const amount = Amount.fromRaw(maxSafe, 18, "ETH");
      expect(amount.toBase()).toBe(maxSafe);
    });

    it("should handle amounts larger than MAX_SAFE_INTEGER", () => {
      const largeValue = BigInt("99999999999999999999999999999999");
      const amount = Amount.fromRaw(largeValue, 18, "ETH");
      expect(amount.toBase()).toBe(largeValue);
    });

    it("should handle fractional parts with all same digits", () => {
      const amount = Amount.parse("1.111111", 18, "ETH");
      expect(amount.toUnit()).toBe("1.111111");
    });

    it("should handle amount with single trailing zero in fraction", () => {
      const amount = Amount.fromRaw(1100000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("1.1");
    });
  });

  describe("getDecimals", () => {
    it("should return decimals for ETH (18)", () => {
      const amount = Amount.parse("1.5", 18, "ETH");
      expect(amount.getDecimals()).toBe(18);
    });

    it("should return decimals for USDC (6)", () => {
      const amount = Amount.parse("100", 6, "USDC");
      expect(amount.getDecimals()).toBe(6);
    });

    it("should return decimals for BTC (8)", () => {
      const amount = Amount.parse("0.5", 8, "BTC");
      expect(amount.getDecimals()).toBe(8);
    });

    it("should return 0 decimals for zero-decimal tokens", () => {
      const amount = Amount.parse("100", 0, "TOKEN");
      expect(amount.getDecimals()).toBe(0);
    });

    it("should return decimals from token", () => {
      const amount = Amount.parse("1.5", mockETH);
      expect(amount.getDecimals()).toBe(mockETH.decimals);
    });
  });

  describe("getSymbol", () => {
    it("should return symbol when set", () => {
      const amount = Amount.parse("1.5", 18, "ETH");
      expect(amount.getSymbol()).toBe("ETH");
    });

    it("should return undefined when no symbol set", () => {
      const amount = Amount.parse("1.5", 18);
      expect(amount.getSymbol()).toBeUndefined();
    });

    it("should return symbol from token", () => {
      const amount = Amount.parse("1.5", mockUSDC);
      expect(amount.getSymbol()).toBe("USDC");
    });

    it("should return symbol from base constructor with token", () => {
      const amount = Amount.fromRaw(1500000000000000000n, mockETH);
      expect(amount.getSymbol()).toBe("ETH");
    });

    it("should return empty string when symbol is empty string", () => {
      const amount = Amount.parse("1.5", 18, "");
      expect(amount.getSymbol()).toBe("");
    });
  });
});

describe("tokenAmountToFormatted", () => {
  it("should format basic amount with symbol", () => {
    const result = tokenAmountToFormatted(
      false,
      1500000000000000000n,
      18,
      "ETH"
    );
    expect(result).toBe(`ETH${NBSP}1.5`);
  });

  it("should format zero amount", () => {
    const result = tokenAmountToFormatted(false, 0n, 18, "ETH");
    expect(result).toBe(`ETH${NBSP}0`);
  });

  it("should compress decimals when requested", () => {
    expect(tokenAmountToFormatted(false, 1234567890123456789n, 18, "ETH")).toBe(
      `ETH${NBSP}1.234567890123456789`
    );
    expect(tokenAmountToFormatted(true, 1234567890123456789n, 18, "ETH")).toBe(
      `ETH${NBSP}1.2346`
    );
  });

  it("should handle 6 decimals (USDC)", () => {
    expect(tokenAmountToFormatted(false, 100500000n, 6, "USDC")).toBe(
      `USDC${NBSP}100.5`
    );
  });

  it("should handle 8 decimals (BTC)", () => {
    expect(tokenAmountToFormatted(false, 50000000n, 8, "BTC")).toBe(
      `BTC${NBSP}0.5`
    );
  });

  it("should handle empty symbol", () => {
    expect(tokenAmountToFormatted(false, 1000000000000000000n, 18, "")).toBe(
      `${NBSP}1`
    );
  });

  it("should handle large amounts with thousand separators", () => {
    expect(
      tokenAmountToFormatted(false, 1000000000000000000000000n, 18, "ETH")
    ).toBe(`ETH${NBSP}1,000,000`);
  });

  it("should handle very small amounts", () => {
    const result = tokenAmountToFormatted(false, 1n, 18, "ETH");
    expect(result).toBe(`ETH${NBSP}0.000000000000000001`);
  });

  it("should limit to 4 decimals when compressed", () => {
    expect(tokenAmountToFormatted(true, 1234567890000000000n, 18, "ETH")).toBe(
      `ETH${NBSP}1.2346`
    );
  });

  it("should respect token decimals in compressed mode when less than 4", () => {
    // For a token with only 2 decimals, compressed mode uses min(4, 2) = 2
    expect(tokenAmountToFormatted(true, 9999n, 2, "USD")).toBe(
      `USD${NBSP}99.99`
    );
  });

  it("should format whole numbers without decimal places", () => {
    expect(tokenAmountToFormatted(false, 1000000n, 6, "USDC")).toBe(
      `USDC${NBSP}1`
    );
    expect(tokenAmountToFormatted(false, 100000000n, 8, "BTC")).toBe(
      `BTC${NBSP}1`
    );
  });

  it("should handle amounts with trailing zeros in fraction", () => {
    expect(tokenAmountToFormatted(false, 1100000000000000000n, 18, "ETH")).toBe(
      `ETH${NBSP}1.1`
    );
  });
});

describe("Amount arithmetic operations", () => {
  describe("add", () => {
    it("should add two amounts with same decimals and symbol", () => {
      const a = Amount.parse("1.5", 18, "ETH");
      const b = Amount.parse("2.5", 18, "ETH");
      const result = a.add(b);
      expect(result.toUnit()).toBe("4");
      expect(result.getDecimals()).toBe(18);
      expect(result.getSymbol()).toBe("ETH");
    });

    it("should add amounts when one has no symbol", () => {
      const a = Amount.parse("1.5", 18, "ETH");
      const b = Amount.parse("2.5", 18);
      const result = a.add(b);
      expect(result.toUnit()).toBe("4");
      expect(result.getSymbol()).toBe("ETH");
    });

    it("should add amounts when neither has symbol", () => {
      const a = Amount.parse("1.5", 18);
      const b = Amount.parse("2.5", 18);
      const result = a.add(b);
      expect(result.toUnit()).toBe("4");
      expect(result.getSymbol()).toBeUndefined();
    });

    it("should throw on different decimals", () => {
      const a = Amount.parse("1.5", 18, "ETH");
      const b = Amount.parse("2.5", 6, "USDC");
      expect(() => a.add(b)).toThrow(
        "Cannot perform arithmetic on amounts with different decimals: 18 vs 6"
      );
    });

    it("should throw on different symbols", () => {
      const a = Amount.parse("1.5", 18, "ETH");
      const b = Amount.parse("2.5", 18, "DAI");
      expect(() => a.add(b)).toThrow(
        'Cannot perform arithmetic on amounts with different symbols: "ETH" vs "DAI"'
      );
    });

    it("should handle adding zero", () => {
      const a = Amount.parse("1.5", 18, "ETH");
      const b = Amount.parse("0", 18, "ETH");
      expect(a.add(b).toUnit()).toBe("1.5");
    });

    it("should handle very small amounts", () => {
      const a = Amount.fromRaw(1n, 18, "ETH");
      const b = Amount.fromRaw(1n, 18, "ETH");
      expect(a.add(b).toBase()).toBe(2n);
    });
  });

  describe("subtract", () => {
    it("should subtract two amounts with same decimals and symbol", () => {
      const a = Amount.parse("5", 18, "ETH");
      const b = Amount.parse("2", 18, "ETH");
      const result = a.subtract(b);
      expect(result.toUnit()).toBe("3");
      expect(result.getDecimals()).toBe(18);
      expect(result.getSymbol()).toBe("ETH");
    });

    it("should subtract amounts when one has no symbol", () => {
      const a = Amount.parse("5", 18, "ETH");
      const b = Amount.parse("2", 18);
      const result = a.subtract(b);
      expect(result.toUnit()).toBe("3");
      expect(result.getSymbol()).toBe("ETH");
    });

    it("should throw on different decimals", () => {
      const a = Amount.parse("5", 18, "ETH");
      const b = Amount.parse("2", 6, "USDC");
      expect(() => a.subtract(b)).toThrow(
        "Cannot perform arithmetic on amounts with different decimals: 18 vs 6"
      );
    });

    it("should throw on different symbols", () => {
      const a = Amount.parse("5", 18, "ETH");
      const b = Amount.parse("2", 18, "DAI");
      expect(() => a.subtract(b)).toThrow(
        'Cannot perform arithmetic on amounts with different symbols: "ETH" vs "DAI"'
      );
    });

    it("should handle subtracting to zero", () => {
      const a = Amount.parse("5", 18, "ETH");
      const b = Amount.parse("5", 18, "ETH");
      expect(a.subtract(b).toUnit()).toBe("0");
    });

    it("should handle fractional results", () => {
      const a = Amount.parse("1.5", 18, "ETH");
      const b = Amount.parse("0.3", 18, "ETH");
      expect(a.subtract(b).toUnit()).toBe("1.2");
    });
  });

  describe("multiply", () => {
    it("should multiply by integer", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply(2).toUnit()).toBe("20");
    });

    it("should multiply by string integer", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply("3").toUnit()).toBe("30");
    });

    it("should multiply by fractional value", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply("0.5").toUnit()).toBe("5");
    });

    it("should multiply by decimal value", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply("1.5").toUnit()).toBe("15");
    });

    it("should multiply by zero", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply(0).toUnit()).toBe("0");
    });

    it("should preserve decimals and symbol", () => {
      const amount = Amount.parse("10", 6, "USDC");
      const result = amount.multiply(2);
      expect(result.getDecimals()).toBe(6);
      expect(result.getSymbol()).toBe("USDC");
    });

    it("should handle small multipliers", () => {
      const amount = Amount.parse("100", 18, "ETH");
      expect(amount.multiply("0.001").toUnit()).toBe("0.1");
    });

    it("should throw on negative multiplier", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.multiply("-1")).toThrow("Invalid multiplier");
    });

    it("should throw on invalid multiplier", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.multiply("abc")).toThrow("Invalid multiplier");
    });

    it("should handle bigint multiplier", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply(3n).toUnit()).toBe("30");
    });
  });

  describe("divide", () => {
    it("should divide by integer", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.divide(2).toUnit()).toBe("5");
    });

    it("should divide by string integer", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.divide("4").toUnit()).toBe("2.5");
    });

    it("should divide by fractional value (effectively multiply)", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.divide("0.5").toUnit()).toBe("20");
    });

    it("should divide by decimal value", () => {
      const amount = Amount.parse("15", 18, "ETH");
      expect(amount.divide("1.5").toUnit()).toBe("10");
    });

    it("should throw on division by zero", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.divide(0)).toThrow("Division by zero");
    });

    it("should throw on division by zero string", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.divide("0")).toThrow("Division by zero");
    });

    it("should throw a precision error on tiny non-zero divisors", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.divide("0.0000000000000000001")).toThrow("too small");
    });

    it("should preserve decimals and symbol", () => {
      const amount = Amount.parse("10", 6, "USDC");
      const result = amount.divide(2);
      expect(result.getDecimals()).toBe(6);
      expect(result.getSymbol()).toBe("USDC");
    });

    it("should throw on negative divisor", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.divide("-2")).toThrow("Invalid divisor");
    });

    it("should throw on invalid divisor", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(() => amount.divide("abc")).toThrow("Invalid divisor");
    });

    it("should handle bigint divisor", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.divide(2n).toUnit()).toBe("5");
    });

    it("should floor the result for non-exact division", () => {
      const amount = Amount.parse("10", 18, "ETH");
      // 10 / 3 = 3.333... but with integer division we lose some precision
      const result = amount.divide(3);
      // The result should be close to 3.333...
      expect(result.toUnit()).toBe("3.333333333333333333");
    });
  });

  describe("comparison operations", () => {
    describe("eq", () => {
      it("should return true for equal amounts", () => {
        const a = Amount.parse("1.5", 18, "ETH");
        const b = Amount.parse("1.5", 18, "ETH");
        expect(a.eq(b)).toBe(true);
      });

      it("should return false for different amounts", () => {
        const a = Amount.parse("1.5", 18, "ETH");
        const b = Amount.parse("2", 18, "ETH");
        expect(a.eq(b)).toBe(false);
      });

      it("should return false on different decimals", () => {
        const a = Amount.parse("1.5", 18, "ETH");
        const b = Amount.parse("1.5", 6, "USDC");
        expect(a.eq(b)).toBe(false);
      });

      it("should return false on different symbols", () => {
        const a = Amount.parse("1.5", 18, "ETH");
        const b = Amount.parse("1.5", 18, "DAI");
        expect(a.eq(b)).toBe(false);
      });

      it("should return true when one has no symbol", () => {
        const a = Amount.parse("1.5", 18, "ETH");
        const b = Amount.parse("1.5", 18);
        expect(a.eq(b)).toBe(true);
      });
    });

    describe("gt", () => {
      it("should return true when greater", () => {
        const a = Amount.parse("2", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.gt(b)).toBe(true);
      });

      it("should return false when equal", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.gt(b)).toBe(false);
      });

      it("should return false when less", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("2", 18, "ETH");
        expect(a.gt(b)).toBe(false);
      });

      it("should return false on incompatible decimals", () => {
        const a = Amount.parse("100", 18, "ETH");
        const b = Amount.parse("1", 6, "USDC");
        expect(a.gt(b)).toBe(false);
      });

      it("should return false on incompatible symbols", () => {
        const a = Amount.parse("2", 18, "ETH");
        const b = Amount.parse("1", 18, "DAI");
        expect(a.gt(b)).toBe(false);
      });
    });

    describe("gte", () => {
      it("should return true when greater", () => {
        const a = Amount.parse("2", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.gte(b)).toBe(true);
      });

      it("should return true when equal", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.gte(b)).toBe(true);
      });

      it("should return false when less", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("2", 18, "ETH");
        expect(a.gte(b)).toBe(false);
      });

      it("should return false on incompatible amounts", () => {
        const a = Amount.parse("100", 18, "ETH");
        const b = Amount.parse("1", 6, "USDC");
        expect(a.gte(b)).toBe(false);
      });
    });

    describe("lt", () => {
      it("should return true when less", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("2", 18, "ETH");
        expect(a.lt(b)).toBe(true);
      });

      it("should return false when equal", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.lt(b)).toBe(false);
      });

      it("should return false when greater", () => {
        const a = Amount.parse("2", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.lt(b)).toBe(false);
      });

      it("should return false on incompatible amounts", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("100", 6, "USDC");
        expect(a.lt(b)).toBe(false);
      });
    });

    describe("lte", () => {
      it("should return true when less", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("2", 18, "ETH");
        expect(a.lte(b)).toBe(true);
      });

      it("should return true when equal", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.lte(b)).toBe(true);
      });

      it("should return false when greater", () => {
        const a = Amount.parse("2", 18, "ETH");
        const b = Amount.parse("1", 18, "ETH");
        expect(a.lte(b)).toBe(false);
      });

      it("should return false on incompatible amounts", () => {
        const a = Amount.parse("1", 18, "ETH");
        const b = Amount.parse("100", 6, "USDC");
        expect(a.lte(b)).toBe(false);
      });
    });

    describe("isZero", () => {
      it("should return true for zero amount", () => {
        const amount = Amount.parse("0", 18, "ETH");
        expect(amount.isZero()).toBe(true);
      });

      it("should return false for non-zero amount", () => {
        const amount = Amount.parse("0.1", 18, "ETH");
        expect(amount.isZero()).toBe(false);
      });

      it("should return true for zero base", () => {
        const amount = Amount.fromRaw(0n, 18, "ETH");
        expect(amount.isZero()).toBe(true);
      });
    });

    describe("isPositive", () => {
      it("should return true for positive amount", () => {
        const amount = Amount.parse("1", 18, "ETH");
        expect(amount.isPositive()).toBe(true);
      });

      it("should return false for zero amount", () => {
        const amount = Amount.parse("0", 18, "ETH");
        expect(amount.isPositive()).toBe(false);
      });

      it("should return true for very small positive amount", () => {
        const amount = Amount.fromRaw(1n, 18, "ETH");
        expect(amount.isPositive()).toBe(true);
      });
    });
  });

  describe("chaining operations", () => {
    it("should support chaining add operations", () => {
      const a = Amount.parse("1", 18, "ETH");
      const b = Amount.parse("2", 18, "ETH");
      const c = Amount.parse("3", 18, "ETH");
      expect(a.add(b).add(c).toUnit()).toBe("6");
    });

    it("should support chaining multiply and divide", () => {
      const amount = Amount.parse("10", 18, "ETH");
      expect(amount.multiply(2).divide(4).toUnit()).toBe("5");
    });

    it("should support complex chaining", () => {
      const a = Amount.parse("10", 18, "ETH");
      const b = Amount.parse("5", 18, "ETH");
      // (10 + 5) * 2 / 3 = 10
      expect(a.add(b).multiply(2).divide(3).toUnit()).toBe("10");
    });
  });
});
