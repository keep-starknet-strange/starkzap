import { describe, expect, it, vi } from "vitest";
import { OftBridge } from "@/bridge/ethereum/oft/OftBridge";
import { Amount, type EthereumAddress } from "@/types";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import { getAddress } from "ethers";

const normalizeEthereumAddress = (value: string) =>
  fromEthereumAddress(value, { getAddress });

type OftBridgeHarness = {
  cachedSpender: EthereumAddress | null | undefined;
  getOftMinAmount: ReturnType<typeof vi.fn>;
  layerZeroApi: {
    getDepositQuotes: ReturnType<typeof vi.fn>;
    getApprovalTransaction: ReturnType<typeof vi.fn>;
    extractSpenderFromApprovalTx: ReturnType<typeof vi.fn>;
  };
  getAllowanceSpender(): Promise<EthereumAddress | null>;
};

describe("OftBridge", () => {
  it("getAllowanceSpender should retry after transient quote failures", async () => {
    const spender = normalizeEthereumAddress(
      "0x1111111111111111111111111111111111111111"
    );
    const bridge = Object.create(
      OftBridge.prototype
    ) as unknown as OftBridgeHarness;

    bridge.cachedSpender = undefined;
    bridge.getOftMinAmount = vi
      .fn()
      .mockReturnValue(Amount.fromRaw(1n, 18, "TKN"));
    bridge.layerZeroApi = {
      getDepositQuotes: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary"))
        .mockResolvedValueOnce([{}]),
      getApprovalTransaction: vi.fn().mockReturnValue({ data: "0x" }),
      extractSpenderFromApprovalTx: vi.fn().mockReturnValue(spender),
    };

    await expect(bridge.getAllowanceSpender()).resolves.toBeNull();
    expect(bridge.cachedSpender).toBeUndefined();

    await expect(bridge.getAllowanceSpender()).resolves.toBe(spender);
    expect(bridge.layerZeroApi.getDepositQuotes).toHaveBeenCalledTimes(2);
  });

  it("getAllowanceSpender should cache resolved spender", async () => {
    const spender = normalizeEthereumAddress(
      "0x2222222222222222222222222222222222222222"
    );
    const bridge = Object.create(
      OftBridge.prototype
    ) as unknown as OftBridgeHarness;

    bridge.cachedSpender = undefined;
    bridge.getOftMinAmount = vi
      .fn()
      .mockReturnValue(Amount.fromRaw(1n, 18, "TKN"));
    bridge.layerZeroApi = {
      getDepositQuotes: vi.fn().mockResolvedValue([{}]),
      getApprovalTransaction: vi.fn().mockReturnValue({ data: "0x" }),
      extractSpenderFromApprovalTx: vi.fn().mockReturnValue(spender),
    };

    await expect(bridge.getAllowanceSpender()).resolves.toBe(spender);
    await expect(bridge.getAllowanceSpender()).resolves.toBe(spender);
    expect(bridge.layerZeroApi.getDepositQuotes).toHaveBeenCalledTimes(1);
  });
});
