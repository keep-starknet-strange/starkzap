import { describe, expect, it, vi } from "vitest";
import { EthereumBridge } from "@/bridge/ethereum/EthereumBridge";
import { Amount } from "@/types";
import { TransactionErrorCause } from "@/types/errors";
import { fromEthereumAddress } from "@/connect/ethersRuntime";
import { getAddress } from "ethers";

const normalizeEthereumAddress = (value: string) =>
  fromEthereumAddress(value, { getAddress });

type BridgeForApprove = {
  approveSpendingOf(amount: Amount): Promise<void>;
  getAllowanceSpender: ReturnType<typeof vi.fn>;
  getAllowance: ReturnType<typeof vi.fn>;
  token: { approve: ReturnType<typeof vi.fn> };
  config: { signer: unknown };
  execute: ReturnType<typeof vi.fn>;
  updateAllowanceFromReceipt: ReturnType<typeof vi.fn>;
};

type BridgeForExecute = {
  execute(tx: unknown): Promise<unknown>;
  config: {
    signer: {
      sendTransaction: ReturnType<typeof vi.fn>;
    };
  };
};

describe("EthereumBridge", () => {
  it("approveSpendingOf should approve and update allowance when insufficient", async () => {
    const bridge = Object.create(
      EthereumBridge.prototype
    ) as unknown as BridgeForApprove;
    const spender = normalizeEthereumAddress(
      "0x1111111111111111111111111111111111111111"
    );
    const requestedAmount = Amount.fromRaw(100n, 6, "USDC");
    const signer = { sendTransaction: vi.fn() };
    const txRequest = { to: "0x2222222222222222222222222222222222222222" };
    const receipt = { status: 1 };

    bridge.getAllowanceSpender = vi.fn().mockResolvedValue(spender);
    bridge.getAllowance = vi
      .fn()
      .mockResolvedValue(Amount.fromRaw(10n, 6, "USDC"));
    bridge.token = {
      approve: vi.fn().mockResolvedValue(txRequest),
    };
    bridge.config = { signer };
    bridge.execute = vi.fn().mockResolvedValue({
      wait: vi.fn().mockResolvedValue(receipt),
    });
    bridge.updateAllowanceFromReceipt = vi.fn().mockResolvedValue(undefined);

    await bridge.approveSpendingOf(requestedAmount);

    expect(bridge.token.approve).toHaveBeenCalledWith(
      spender,
      requestedAmount,
      signer
    );
    expect(bridge.execute).toHaveBeenCalledWith(txRequest);
    expect(bridge.updateAllowanceFromReceipt).toHaveBeenCalledWith(receipt);
  });

  it("approveSpendingOf should skip approval when spender is unavailable", async () => {
    const bridge = Object.create(
      EthereumBridge.prototype
    ) as unknown as BridgeForApprove;
    bridge.getAllowanceSpender = vi.fn().mockResolvedValue(null);
    bridge.getAllowance = vi.fn();
    bridge.token = {
      approve: vi.fn(),
    };

    await bridge.approveSpendingOf(Amount.fromRaw(100n, 6, "USDC"));

    expect(bridge.getAllowance).not.toHaveBeenCalled();
    expect(bridge.token.approve).not.toHaveBeenCalled();
  });

  it("execute should map ACTION_REJECTED to USER_REJECTED", async () => {
    const bridge = Object.create(
      EthereumBridge.prototype
    ) as unknown as BridgeForExecute;
    bridge.config = {
      signer: {
        sendTransaction: vi.fn().mockRejectedValue({ code: "ACTION_REJECTED" }),
      },
    };

    await expect(bridge.execute({})).rejects.toThrow(
      TransactionErrorCause.USER_REJECTED
    );
  });

  it("execute should map INSUFFICIENT_FUNDS to INSUFFICIENT_BALANCE", async () => {
    const bridge = Object.create(
      EthereumBridge.prototype
    ) as unknown as BridgeForExecute;
    bridge.config = {
      signer: {
        sendTransaction: vi
          .fn()
          .mockRejectedValue({ code: "INSUFFICIENT_FUNDS" }),
      },
    };

    await expect(bridge.execute({})).rejects.toThrow(
      TransactionErrorCause.INSUFFICIENT_BALANCE
    );
  });

  it("execute should rethrow unknown errors", async () => {
    const bridge = Object.create(
      EthereumBridge.prototype
    ) as unknown as BridgeForExecute;
    const original = new Error("unexpected");
    bridge.config = {
      signer: {
        sendTransaction: vi.fn().mockRejectedValue(original),
      },
    };

    await expect(bridge.execute({})).rejects.toBe(original);
  });
});
