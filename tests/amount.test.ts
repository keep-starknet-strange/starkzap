import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Amount, tokenAmountToFormatted } from "../src/types/amount.js";
import type { Token } from "../src/types/token.js";
import type { Address } from "../src/types/address.js";

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
  describe("fromUnit", () => {
    describe("with string input", () => {
      it("should create amount from integer string", () => {
        const amount = Amount.fromUnit("10", 18, "ETH");
        expect(amount.toBase()).toBe(10000000000000000000n);
        expect(amount.toUnit()).toBe("10");
      });

      it("should create amount from decimal string", () => {
        const amount = Amount.fromUnit("1.5", 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should create amount from string with many decimal places", () => {
        const amount = Amount.fromUnit("0.123456789012345678", 18, "ETH");
        expect(amount.toBase()).toBe(123456789012345678n);
        expect(amount.toUnit()).toBe("0.123456789012345678");
      });

      it("should handle zero", () => {
        const amount = Amount.fromUnit("0", 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should handle string with leading zeros", () => {
        const amount = Amount.fromUnit("0.001", 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000n);
        expect(amount.toUnit()).toBe("0.001");
      });

      it("should handle very small decimal values", () => {
        const amount = Amount.fromUnit("0.000000000000000001", 18, "ETH");
        expect(amount.toBase()).toBe(1n);
        expect(amount.toUnit()).toBe("0.000000000000000001");
      });
    });

    describe("with number input", () => {
      it("should create amount from integer number", () => {
        const amount = Amount.fromUnit(10, 18, "ETH");
        expect(amount.toBase()).toBe(10000000000000000000n);
        expect(amount.toUnit()).toBe("10");
      });

      it("should create amount from decimal number", () => {
        const amount = Amount.fromUnit(1.5, 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should handle zero as number", () => {
        const amount = Amount.fromUnit(0, 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });
    });

    describe("with bigint input", () => {
      it("should treat bigint as whole units", () => {
        const amount = Amount.fromUnit(10n, 18, "ETH");
        expect(amount.toBase()).toBe(10000000000000000000n);
        expect(amount.toUnit()).toBe("10");
      });

      it("should handle zero bigint", () => {
        const amount = Amount.fromUnit(0n, 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should handle large bigint values", () => {
        const amount = Amount.fromUnit(1000000n, 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000000000000n);
        expect(amount.toUnit()).toBe("1000000");
      });
    });

    describe("with different decimals", () => {
      it("should work with 6 decimals (USDC-like)", () => {
        const amount = Amount.fromUnit("100.5", 6, "USDC");
        expect(amount.toBase()).toBe(100500000n);
        expect(amount.toUnit()).toBe("100.5");
      });

      it("should work with 8 decimals (BTC-like)", () => {
        const amount = Amount.fromUnit("0.5", 8, "BTC");
        expect(amount.toBase()).toBe(50000000n);
        expect(amount.toUnit()).toBe("0.5");
      });

      it("should work with 0 decimals", () => {
        const amount = Amount.fromUnit("100", 0, "TOKEN");
        expect(amount.toBase()).toBe(100n);
        expect(amount.toUnit()).toBe("100");
      });

      it("should work with 2 decimals (cent-based)", () => {
        const amount = Amount.fromUnit("99.99", 2, "USD");
        expect(amount.toBase()).toBe(9999n);
        expect(amount.toUnit()).toBe("99.99");
      });
    });

    describe("error handling", () => {
      it("should throw on negative number", () => {
        expect(() => Amount.fromUnit("-1", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on negative decimal", () => {
        expect(() => Amount.fromUnit("-0.5", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on non-numeric string", () => {
        expect(() => Amount.fromUnit("abc", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on string with letters", () => {
        expect(() => Amount.fromUnit("10ETH", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on empty string", () => {
        expect(() => Amount.fromUnit("", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on precision overflow", () => {
        expect(() => Amount.fromUnit("1.1234567", 6, "USDC")).toThrow(
          "Precision overflow"
        );
      });

      it("should throw when exceeding 18 decimals", () => {
        expect(() =>
          Amount.fromUnit("0.0000000000000000001", 18, "ETH")
        ).toThrow("Precision overflow");
      });

      it("should throw on string with spaces", () => {
        expect(() => Amount.fromUnit(" 10 ", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on string with commas", () => {
        expect(() => Amount.fromUnit("1,000", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });

      it("should throw on multiple decimal points", () => {
        expect(() => Amount.fromUnit("1.5.5", 18, "ETH")).toThrow(
          "Invalid unit amount"
        );
      });
    });
  });

  describe("fromBase", () => {
    describe("with bigint input", () => {
      it("should create amount from bigint", () => {
        const amount = Amount.fromBase(1500000000000000000n, 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should handle zero", () => {
        const amount = Amount.fromBase(0n, 18, "ETH");
        expect(amount.toBase()).toBe(0n);
        expect(amount.toUnit()).toBe("0");
      });

      it("should handle very large values", () => {
        const amount = Amount.fromBase(1000000000000000000000000n, 18, "ETH");
        expect(amount.toBase()).toBe(1000000000000000000000000n);
        expect(amount.toUnit()).toBe("1000000");
      });

      it("should handle small values (less than 1 unit)", () => {
        const amount = Amount.fromBase(500000000000000n, 18, "ETH");
        expect(amount.toBase()).toBe(500000000000000n);
        expect(amount.toUnit()).toBe("0.0005");
      });
    });

    describe("with string input", () => {
      it("should create amount from numeric string", () => {
        const amount = Amount.fromBase("1500000000000000000", 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });

      it("should handle hex string", () => {
        const amount = Amount.fromBase("0x14D1120D7B160000", 18, "ETH");
        expect(amount.toBase()).toBe(1500000000000000000n);
        expect(amount.toUnit()).toBe("1.5");
      });
    });

    describe("with number input", () => {
      it("should create amount from integer number", () => {
        const amount = Amount.fromBase(1000000, 6, "USDC");
        expect(amount.toBase()).toBe(1000000n);
        expect(amount.toUnit()).toBe("1");
      });
    });

    describe("with different decimals", () => {
      it("should work with 6 decimals", () => {
        const amount = Amount.fromBase(100500000n, 6, "USDC");
        expect(amount.toUnit()).toBe("100.5");
      });

      it("should work with 8 decimals", () => {
        const amount = Amount.fromBase(50000000n, 8, "BTC");
        expect(amount.toUnit()).toBe("0.5");
      });

      it("should work with 0 decimals", () => {
        const amount = Amount.fromBase(100n, 0, "TOKEN");
        expect(amount.toUnit()).toBe("100");
      });
    });
  });

  describe("fromTokenUnit", () => {
    it("should use token decimals and symbol", () => {
      const amount = Amount.fromTokenUnit("1.5", mockETH);
      expect(amount.toBase()).toBe(1500000000000000000n);
      expect(amount.toUnit()).toBe("1.5");
    });

    it("should work with USDC token (6 decimals)", () => {
      const amount = Amount.fromTokenUnit("100", mockUSDC);
      expect(amount.toBase()).toBe(100000000n);
      expect(amount.toUnit()).toBe("100");
    });

    it("should work with BTC token (8 decimals)", () => {
      const amount = Amount.fromTokenUnit("0.5", mockBTC);
      expect(amount.toBase()).toBe(50000000n);
      expect(amount.toUnit()).toBe("0.5");
    });

    it("should throw on precision overflow for token", () => {
      expect(() => Amount.fromTokenUnit("1.1234567", mockUSDC)).toThrow(
        "Precision overflow"
      );
    });
  });

  describe("fromTokenBase", () => {
    it("should use token decimals and symbol", () => {
      const amount = Amount.fromTokenBase(1500000000000000000n, mockETH);
      expect(amount.toBase()).toBe(1500000000000000000n);
      expect(amount.toUnit()).toBe("1.5");
    });

    it("should work with USDC token", () => {
      const amount = Amount.fromTokenBase(100000000n, mockUSDC);
      expect(amount.toUnit()).toBe("100");
    });

    it("should work with BTC token", () => {
      const amount = Amount.fromTokenBase(50000000n, mockBTC);
      expect(amount.toUnit()).toBe("0.5");
    });
  });

  describe("toBase", () => {
    it("should return exact bigint value", () => {
      const amount = Amount.fromUnit("1.5", 18, "ETH");
      expect(amount.toBase()).toBe(1500000000000000000n);
    });

    it("should be idempotent", () => {
      const amount = Amount.fromUnit("1.5", 18, "ETH");
      expect(amount.toBase()).toBe(amount.toBase());
    });

    it("should preserve precision through round-trip", () => {
      const originalBase = 123456789012345678n;
      const amount = Amount.fromBase(originalBase, 18, "ETH");
      expect(amount.toBase()).toBe(originalBase);
    });
  });

  describe("toUnit", () => {
    it("should strip trailing zeros", () => {
      const amount = Amount.fromBase(1000000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("1");
    });

    it("should preserve non-trailing zeros", () => {
      const amount = Amount.fromBase(1001000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("1.001");
    });

    it("should handle values less than 1", () => {
      const amount = Amount.fromBase(100000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("0.1");
    });

    it("should handle very small values", () => {
      const amount = Amount.fromBase(1n, 18, "ETH");
      expect(amount.toUnit()).toBe("0.000000000000000001");
    });

    it("should handle exact integer amounts", () => {
      const amount = Amount.fromUnit("100", 18, "ETH");
      expect(amount.toUnit()).toBe("100");
    });

    it("should be idempotent", () => {
      const amount = Amount.fromUnit("1.5", 18, "ETH");
      expect(amount.toUnit()).toBe(amount.toUnit());
    });
  });

  describe("toFormatted", () => {
    it("should format amount with symbol", () => {
      const amount = Amount.fromUnit("1.5", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}1.5`);
    });

    it("should format amount without symbol", () => {
      const amount = Amount.fromUnit("1.5", 18);
      expect(amount.toFormatted()).toBe(`${NBSP}1.5`);
    });

    it("should compress decimals when compressed is true", () => {
      const amount = Amount.fromUnit("1.123456789", 18, "ETH");
      expect(amount.toFormatted(true)).toBe(`ETH${NBSP}1.1235`);
      expect(amount.toFormatted(false)).toBe(`ETH${NBSP}1.123456789`);
    });

    it("should handle zero amount", () => {
      const amount = Amount.fromUnit("0", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}0`);
    });

    it("should handle large numbers with thousand separators", () => {
      const amount = Amount.fromUnit("1000000", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}1,000,000`);
    });

    it("should handle amounts with many decimal places", () => {
      const amount = Amount.fromUnit("1.123456789012345678", 18, "ETH");
      // Note: Float precision loss occurs at ~16 significant digits
      expect(amount.toFormatted()).toBe(`ETH${NBSP}1.1234567890123457`);
    });

    it("should handle small fractional amounts", () => {
      const amount = Amount.fromUnit("0.001", 18, "ETH");
      expect(amount.toFormatted()).toBe(`ETH${NBSP}0.001`);
    });
  });

  describe("round-trip conversions", () => {
    it("should preserve value through unit -> base -> unit", () => {
      const original = "1.5";
      const amount = Amount.fromUnit(original, 18, "ETH");
      expect(amount.toUnit()).toBe(original);
    });

    it("should preserve value through base -> unit -> base", () => {
      const originalBase = 1500000000000000000n;
      const amount = Amount.fromBase(originalBase, 18, "ETH");
      const unitValue = amount.toUnit();
      const recreated = Amount.fromUnit(unitValue, 18, "ETH");
      expect(recreated.toBase()).toBe(originalBase);
    });

    it("should handle precision at boundary", () => {
      // Maximum precision for 18 decimals
      const original = "1.123456789012345678";
      const amount = Amount.fromUnit(original, 18, "ETH");
      expect(amount.toUnit()).toBe(original);
    });

    it("should handle very large amounts", () => {
      const original = "999999999999999999";
      const amount = Amount.fromUnit(original, 18, "ETH");
      expect(amount.toUnit()).toBe(original);
    });
  });

  describe("edge cases", () => {
    it("should handle 1 wei correctly", () => {
      const amount = Amount.fromBase(1n, 18, "ETH");
      expect(amount.toUnit()).toBe("0.000000000000000001");
    });

    it("should handle maximum safe integer boundary", () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const amount = Amount.fromBase(maxSafe, 18, "ETH");
      expect(amount.toBase()).toBe(maxSafe);
    });

    it("should handle amounts larger than MAX_SAFE_INTEGER", () => {
      const largeValue = BigInt("99999999999999999999999999999999");
      const amount = Amount.fromBase(largeValue, 18, "ETH");
      expect(amount.toBase()).toBe(largeValue);
    });

    it("should handle fractional parts with all same digits", () => {
      const amount = Amount.fromUnit("1.111111", 18, "ETH");
      expect(amount.toUnit()).toBe("1.111111");
    });

    it("should handle amount with single trailing zero in fraction", () => {
      const amount = Amount.fromBase(1100000000000000000n, 18, "ETH");
      expect(amount.toUnit()).toBe("1.1");
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
    // Note: Float precision loss occurs at ~16 significant digits
    expect(tokenAmountToFormatted(false, 1234567890123456789n, 18, "ETH")).toBe(
      `ETH${NBSP}1.2345678901234567`
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
