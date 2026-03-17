import { describe, expect, it } from "vitest";
import { CCTPBridge } from "@/bridge/ethereum/cctp/CCTPBridge";
import { Amount } from "@/types";

type CCTPBridgePrivate = {
  calculateMaxFee(amount: Amount, feeBasisPoints: number): Amount;
};

describe("CCTPBridge", () => {
  it("calculateMaxFee should round up basis-point fees", () => {
    const bridgeLike: { usdcAmount(value: bigint): Amount } = {
      usdcAmount: (value: bigint) => Amount.fromRaw(value, 6, "USDC"),
    };
    const amount = Amount.fromRaw(1000n, 6, "USDC");

    const maxFee = (
      CCTPBridge.prototype as unknown as CCTPBridgePrivate
    ).calculateMaxFee.call(bridgeLike, amount, 1);

    expect(maxFee.toBase()).toBe(1n);
  });
});
