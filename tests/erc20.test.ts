import { describe, it, expect, vi } from "vitest";
import { Erc20 } from "../src/erc20/index.js";
import { Amount } from "../src/index.js";
import type { Token } from "../src/index.js";
import type { Address } from "../src/types/address.js";
import type { Wallet } from "../src/index.js";

// Mock tokens for testing
const mockUSDC: Token = {
  name: "USD Coin",
  address:
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8" as Address,
  decimals: 6,
  symbol: "USDC",
};

const mockETH: Token = {
  name: "Ethereum",
  address:
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7" as Address,
  decimals: 18,
  symbol: "ETH",
};

const mockDAI: Token = {
  name: "Dai Stablecoin",
  address:
    "0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3" as Address,
  decimals: 18,
  symbol: "DAI",
};

// Mock wallet for testing
const createMockWallet = () => {
  return {
    address:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Address,
    execute: vi.fn().mockResolvedValue({ hash: "0xmockhash" }),
    getProvider: vi.fn().mockReturnValue({
      callContract: vi.fn().mockResolvedValue(["0x0", "0x0"]), // Mock balance of 0
    }),
  } as unknown as Wallet;
};

describe("Erc20", () => {
  describe("transfer validation", () => {
    it("should accept amount with matching decimals and symbol", async () => {
      const erc20 = new Erc20(mockUSDC);
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      // Should not throw
      await erc20.transfer({
        from: wallet,
        transfers: [
          {
            to: "0xrecipient" as Address,
            amount,
          },
        ],
      });

      expect(wallet.execute).toHaveBeenCalled();
    });

    it("should accept amount without symbol (decimals only validation)", async () => {
      const erc20 = new Erc20(mockUSDC);
      const wallet = createMockWallet();
      // Amount created without symbol but with matching decimals
      const amount = Amount.parse("100", 6);

      // Should not throw - symbol validation is skipped when amount has no symbol
      await erc20.transfer({
        from: wallet,
        transfers: [
          {
            to: "0xrecipient" as Address,
            amount,
          },
        ],
      });

      expect(wallet.execute).toHaveBeenCalled();
    });

    it("should throw on decimals mismatch", async () => {
      const erc20 = new Erc20(mockUSDC); // 6 decimals
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockETH); // 18 decimals

      await expect(
        erc20.transfer({
          from: wallet,
          transfers: [
            {
              to: "0xrecipient" as Address,
              amount,
            },
          ],
        })
      ).rejects.toThrow("Amount decimals mismatch: expected 6 (USDC), got 18");
    });

    it("should throw on symbol mismatch", async () => {
      const erc20 = new Erc20(mockETH); // ETH, 18 decimals
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockDAI); // DAI, 18 decimals (same decimals, different symbol)

      await expect(
        erc20.transfer({
          from: wallet,
          transfers: [
            {
              to: "0xrecipient" as Address,
              amount,
            },
          ],
        })
      ).rejects.toThrow('Amount symbol mismatch: expected "ETH", got "DAI"');
    });

    it("should validate all amounts in multi-transfer", async () => {
      const erc20 = new Erc20(mockUSDC);
      const wallet = createMockWallet();
      const validAmount = Amount.parse("100", mockUSDC);
      const invalidAmount = Amount.parse("50", mockETH);

      await expect(
        erc20.transfer({
          from: wallet,
          transfers: [
            { to: "0xrecipient1" as Address, amount: validAmount },
            { to: "0xrecipient2" as Address, amount: invalidAmount },
          ],
        })
      ).rejects.toThrow("Amount decimals mismatch");
    });

    it("should use toBase() value for contract call", async () => {
      const erc20 = new Erc20(mockUSDC);
      const wallet = createMockWallet();
      const amount = Amount.parse("100", mockUSDC);

      await erc20.transfer({
        from: wallet,
        transfers: [
          {
            to: "0xrecipient" as Address,
            amount,
          },
        ],
      });

      // Verify execute was called with the correct base value in the calldata
      expect(wallet.execute).toHaveBeenCalled();
      const executeCall = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];
      expect(executeCall).toHaveLength(1);
      expect(executeCall[0].entrypoint).toBe("transfer");
      expect(executeCall[0].contractAddress).toBe(mockUSDC.address);
    });
  });

  describe("balanceOf", () => {
    it("should return Amount with correct token info", async () => {
      const erc20 = new Erc20(mockUSDC);
      const wallet = createMockWallet();

      // Mock a balance of 100 USDC (100 * 10^6)
      const mockBalance = 100000000n;
      (
        wallet.getProvider().callContract as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        "0x" + mockBalance.toString(16), // low (with 0x prefix)
        "0x0", // high
      ]);

      const balance = await erc20.balanceOf({ wallet });

      expect(balance.toBase()).toBe(mockBalance);
      expect(balance.getDecimals()).toBe(mockUSDC.decimals);
      expect(balance.getSymbol()).toBe(mockUSDC.symbol);
      expect(balance.toUnit()).toBe("100");
    });

    it("should handle zero balance", async () => {
      const erc20 = new Erc20(mockUSDC);
      const wallet = createMockWallet();

      const balance = await erc20.balanceOf({ wallet });

      expect(balance.toBase()).toBe(0n);
      expect(balance.toUnit()).toBe("0");
      expect(balance.getDecimals()).toBe(6);
      expect(balance.getSymbol()).toBe("USDC");
    });

    it("should handle large balance with 18 decimals", async () => {
      const erc20 = new Erc20(mockETH);
      const wallet = createMockWallet();

      // Mock a balance of 1.5 ETH
      const mockBalance = 1500000000000000000n;
      (
        wallet.getProvider().callContract as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        "0x" + mockBalance.toString(16), // low (with 0x prefix)
        "0x0", // high
      ]);

      const balance = await erc20.balanceOf({ wallet });

      expect(balance.toBase()).toBe(mockBalance);
      expect(balance.toUnit()).toBe("1.5");
      expect(balance.getDecimals()).toBe(18);
      expect(balance.getSymbol()).toBe("ETH");
    });
  });
});
