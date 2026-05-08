import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { LayerSwapMonitor } from "@/bridge/monitor/layerswap/LayerSwapMonitor";
import {
  LayerSwapApiError,
  type LsSwap,
  type LsSwapStatus,
  type LsSwapResponse,
} from "@/bridge/ethereum/layerswap/types";
import { NOOP_LOGGER } from "@/logger";

const SN_HASH =
  "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691";
const L1_HASH = "0x" + "ab".repeat(32);

function fakeSwap(
  status: LsSwapStatus,
  outputHash: string | null = null
): LsSwap {
  return {
    id: "swap-1",
    status,
    transactions: outputHash
      ? [
          {
            type: "output",
            transaction_hash: outputHash,
            status: "completed",
          } as LsSwap["transactions"][number],
        ]
      : [],
  } as unknown as LsSwap;
}

function fakeResponse(swap: LsSwap): LsSwapResponse {
  return { swap } as unknown as LsSwapResponse;
}

function makeMonitor(getSwapByTransactionHash: ReturnType<typeof vi.fn>) {
  const monitor = new LayerSwapMonitor({
    apiKey: "test",
    logger: NOOP_LOGGER,
  });
  // Replace the API's method to control behaviour deterministically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (monitor as any).api.getSwapByTransactionHash = getSwapByTransactionHash;
  return monitor;
}

describe("LayerSwapMonitor", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("monitorDeposit status mapping", () => {
    const cases: {
      input: LsSwapStatus;
      expected: BridgeTransferStatus;
    }[] = [
      { input: "created", expected: BridgeTransferStatus.SUBMITTED_ON_L1 },
      {
        input: "user_transfer_pending",
        expected: BridgeTransferStatus.SUBMITTED_ON_L1,
      },
      {
        input: "user_transfer_delayed",
        expected: BridgeTransferStatus.SUBMITTED_ON_L1,
      },
      {
        input: "ls_transfer_pending",
        expected: BridgeTransferStatus.CONFIRMED_ON_L1,
      },
      {
        input: "completed",
        expected: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
      },
      { input: "failed", expected: BridgeTransferStatus.ERROR },
      { input: "expired", expected: BridgeTransferStatus.ERROR },
      { input: "cancelled", expected: BridgeTransferStatus.ERROR },
      { input: "pending_refund", expected: BridgeTransferStatus.ERROR },
      { input: "refunded", expected: BridgeTransferStatus.ERROR },
    ];

    it.each(cases)(
      "maps deposit lifecycle '$input' to $expected",
      async ({ input, expected }) => {
        const get = vi.fn().mockResolvedValue(fakeResponse(fakeSwap(input)));
        const monitor = makeMonitor(get);
        const result = await monitor.monitorDeposit(L1_HASH);
        expect(result.status).toBe(expected);
      }
    );

    it("maps a 404 to NOT_SUBMITTED_ON_L1", async () => {
      const get = vi
        .fn()
        .mockRejectedValue(new LayerSwapApiError(404, undefined, "not found"));
      const monitor = makeMonitor(get);
      const result = await monitor.monitorDeposit(L1_HASH);
      expect(result.status).toBe(BridgeTransferStatus.NOT_SUBMITTED_ON_L1);
      expect(result.externalTxHash).toBe(L1_HASH);
    });

    it("propagates non-404 errors so callers can retry", async () => {
      const get = vi
        .fn()
        .mockRejectedValue(new LayerSwapApiError(500, undefined, "boom"));
      const monitor = makeMonitor(get);
      await expect(monitor.monitorDeposit(L1_HASH)).rejects.toThrow(/boom/);
    });

    it("resolves the Starknet output hash from swap.transactions", async () => {
      const get = vi
        .fn()
        .mockResolvedValue(fakeResponse(fakeSwap("completed", SN_HASH)));
      const monitor = makeMonitor(get);
      const result = await monitor.monitorDeposit(L1_HASH);
      expect(result.starknetTxHash).toBe(SN_HASH);
    });
  });

  describe("monitorWithdrawal status mapping", () => {
    const cases: {
      input: LsSwapStatus;
      expected: BridgeTransferStatus;
    }[] = [
      {
        input: "created",
        expected: BridgeTransferStatus.SUBMITTED_ON_STARKNET,
      },
      {
        input: "user_transfer_pending",
        expected: BridgeTransferStatus.SUBMITTED_ON_STARKNET,
      },
      {
        input: "ls_transfer_pending",
        expected: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
      },
      { input: "completed", expected: BridgeTransferStatus.COMPLETED_ON_L1 },
      { input: "failed", expected: BridgeTransferStatus.ERROR },
      { input: "refunded", expected: BridgeTransferStatus.ERROR },
    ];

    it.each(cases)(
      "maps withdrawal lifecycle '$input' to $expected",
      async ({ input, expected }) => {
        const get = vi.fn().mockResolvedValue(fakeResponse(fakeSwap(input)));
        const monitor = makeMonitor(get);
        const result = await monitor.monitorWithdrawal(SN_HASH);
        expect(result.status).toBe(expected);
        expect(result.protocol).toBe("layerswap");
      }
    );

    it("normalises Starknet hash before lookup", async () => {
      const get = vi
        .fn()
        .mockResolvedValue(fakeResponse(fakeSwap("completed", L1_HASH)));
      const monitor = makeMonitor(get);
      // Short hash that needs padding
      await monitor.monitorWithdrawal("0x3397f2d");
      const calledWith = get.mock.calls[0]![0] as string;
      expect(calledWith.length).toBe(66);
    });
  });

  describe("getDepositState / getWithdrawalState", () => {
    const monitor = makeMonitor(vi.fn());

    it("getDepositState maps COMPLETED_ON_STARKNET to COMPLETED", async () => {
      await expect(
        monitor.getDepositState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          externalTxHash: L1_HASH,
        })
      ).resolves.toBe(DepositState.COMPLETED);
    });

    it("getDepositState maps ERROR to ERROR", async () => {
      await expect(
        monitor.getDepositState({
          status: BridgeTransferStatus.ERROR,
          externalTxHash: L1_HASH,
        })
      ).resolves.toBe(DepositState.ERROR);
    });

    it("getDepositState defaults to PENDING", async () => {
      await expect(
        monitor.getDepositState({
          status: BridgeTransferStatus.SUBMITTED_ON_L1,
          externalTxHash: L1_HASH,
        })
      ).resolves.toBe(DepositState.PENDING);
    });

    it("getWithdrawalState maps COMPLETED_ON_L1 to COMPLETED", async () => {
      await expect(
        monitor.getWithdrawalState({
          protocol: "layerswap",
          status: BridgeTransferStatus.COMPLETED_ON_L1,
          starknetTxHash: SN_HASH,
        })
      ).resolves.toBe(WithdrawalState.COMPLETED);
    });

    it("getWithdrawalState maps ERROR to ERROR", async () => {
      await expect(
        monitor.getWithdrawalState({
          protocol: "layerswap",
          status: BridgeTransferStatus.ERROR,
          starknetTxHash: SN_HASH,
        })
      ).resolves.toBe(WithdrawalState.ERROR);
    });

    it("getWithdrawalState defaults to PENDING", async () => {
      await expect(
        monitor.getWithdrawalState({
          protocol: "layerswap",
          status: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
          starknetTxHash: SN_HASH,
        })
      ).resolves.toBe(WithdrawalState.PENDING);
    });
  });
});
