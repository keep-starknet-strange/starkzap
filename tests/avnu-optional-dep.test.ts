import { describe, expect, it, vi } from "vitest";
import type { RpcProvider } from "starknet";
import { Amount, ChainId, fromAddress, type Token } from "@/types";

// Simulate @avnu/avnu-sdk not being installed: resolving the optional peer
// dependency rejects, which loadAvnuSdk should translate into an actionable
// install hint. This file is isolated so the loader's module cache is fresh.
vi.mock("@avnu/avnu-sdk", () => {
  throw new Error("Cannot find package '@avnu/avnu-sdk'");
});

import { AvnuSwapProvider } from "@/swap/avnu";
import { AvnuDcaProvider } from "@/dca/avnu";

const tokenIn: Token = {
  name: "Token In",
  symbol: "TIN",
  decimals: 6,
  address: fromAddress("0x111"),
};

const tokenOut: Token = {
  name: "Token Out",
  symbol: "TOUT",
  decimals: 6,
  address: fromAddress("0x222"),
};

const traderAddress = fromAddress("0xabc");

describe("avnu optional peer dependency", () => {
  it("swap getQuote surfaces an install hint when @avnu/avnu-sdk is missing", async () => {
    const provider = new AvnuSwapProvider();

    await expect(
      provider.getQuote({
        chainId: ChainId.MAINNET,
        takerAddress: traderAddress,
        tokenIn,
        tokenOut,
        amountIn: Amount.parse("1", tokenIn),
      })
    ).rejects.toThrow('requires optional peer dependency "@avnu/avnu-sdk"');
  });

  it("dca getOrders surfaces an install hint when @avnu/avnu-sdk is missing", async () => {
    const provider = new AvnuDcaProvider();

    await expect(
      provider.getOrders(
        {
          chainId: ChainId.SEPOLIA,
          rpcProvider: {} as RpcProvider,
          walletAddress: traderAddress,
        },
        { traderAddress }
      )
    ).rejects.toThrow('requires optional peer dependency "@avnu/avnu-sdk"');
  });
});
