import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider, TransactionReceipt } from "ethers";
import type { RpcProvider } from "starknet";
import {
  checkStarknetTxStatus,
  getEthereumTxStatus,
} from "@/bridge/monitor/utils";
import { BridgeTransferStatus } from "@/bridge/monitor/types";

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function starkReceipt(overrides: {
  isError?: boolean;
  isReverted?: boolean;
  finality?: "ACCEPTED_ON_L1" | "ACCEPTED_ON_L2" | "RECEIVED";
}): Awaited<ReturnType<RpcProvider["getTransactionReceipt"]>> {
  return {
    isError: () => overrides.isError ?? false,
    isReverted: () => overrides.isReverted ?? false,
    value: {
      finality_status: overrides.finality ?? "RECEIVED",
    },
  } as Awaited<ReturnType<RpcProvider["getTransactionReceipt"]>>;
}

describe("checkStarknetTxStatus", () => {
  it("returns NOT_SUBMITTED_ON_STARKNET when getTransactionReceipt throws", async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockRejectedValue(new Error("rpc")),
    } as unknown as RpcProvider;

    await expect(checkStarknetTxStatus("0xabc", provider)).resolves.toBe(
      BridgeTransferStatus.NOT_SUBMITTED_ON_STARKNET
    );
  });

  it("maps ACCEPTED_ON_L1 to COMPLETED_ON_STARKNET", async () => {
    const provider = {
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(starkReceipt({ finality: "ACCEPTED_ON_L1" })),
    } as unknown as RpcProvider;

    await expect(checkStarknetTxStatus("0x1", provider)).resolves.toBe(
      BridgeTransferStatus.COMPLETED_ON_STARKNET
    );
  });

  it("maps ACCEPTED_ON_L2 to CONFIRMED_ON_STARKNET", async () => {
    const provider = {
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(starkReceipt({ finality: "ACCEPTED_ON_L2" })),
    } as unknown as RpcProvider;

    await expect(checkStarknetTxStatus("0x1", provider)).resolves.toBe(
      BridgeTransferStatus.CONFIRMED_ON_STARKNET
    );
  });

  it("maps pending finality to SUBMITTED_ON_STARKNET", async () => {
    const provider = {
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(starkReceipt({ finality: "RECEIVED" })),
    } as unknown as RpcProvider;

    await expect(checkStarknetTxStatus("0x1", provider)).resolves.toBe(
      BridgeTransferStatus.SUBMITTED_ON_STARKNET
    );
  });

  it("returns ERROR when receipt is error or reverted", async () => {
    const err = {
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(starkReceipt({ isError: true })),
    } as unknown as RpcProvider;
    const rev = {
      getTransactionReceipt: vi
        .fn()
        .mockResolvedValue(starkReceipt({ isReverted: true })),
    } as unknown as RpcProvider;

    await expect(checkStarknetTxStatus("0x1", err)).resolves.toBe(
      BridgeTransferStatus.ERROR
    );
    await expect(checkStarknetTxStatus("0x1", rev)).resolves.toBe(
      BridgeTransferStatus.ERROR
    );
  });
});

describe("getEthereumTxStatus", () => {
  const txHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  it("returns NOT_SUBMITTED_ON_L1 when tx and receipt are missing", async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getTransaction: vi.fn().mockResolvedValue(null),
    } as unknown as Provider;

    const { status, receipt } = await getEthereumTxStatus(txHash, provider);
    expect(status).toBe(BridgeTransferStatus.NOT_SUBMITTED_ON_L1);
    expect(receipt).toBeNull();
  });

  it("returns SUBMITTED_ON_L1 when receipt missing but tx exists", async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getTransaction: vi.fn().mockResolvedValue({ hash: txHash }),
    } as unknown as Provider;

    const { status, receipt } = await getEthereumTxStatus(txHash, provider);
    expect(status).toBe(BridgeTransferStatus.SUBMITTED_ON_L1);
    expect(receipt).toBeNull();
  });

  it("returns ERROR when mined receipt has failure status", async () => {
    const bad = { status: 0 } as TransactionReceipt;
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue(bad),
    } as unknown as Provider;

    const { status, receipt } = await getEthereumTxStatus(txHash, provider);
    expect(status).toBe(BridgeTransferStatus.ERROR);
    expect(receipt).toBe(bad);
  });

  it("returns CONFIRMED_ON_L1 for successful mined receipt", async () => {
    const ok = { status: 1 } as TransactionReceipt;
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue(ok),
    } as unknown as Provider;

    const { status, receipt } = await getEthereumTxStatus(txHash, provider);
    expect(status).toBe(BridgeTransferStatus.CONFIRMED_ON_L1);
    expect(receipt).toBe(ok);
  });
});
