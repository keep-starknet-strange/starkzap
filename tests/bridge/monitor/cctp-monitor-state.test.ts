import { describe, expect, it, vi } from "vitest";
import type { Provider } from "ethers";
import type { RpcProvider } from "starknet";
import { ChainId } from "@/types";
import {
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { CctpMonitor } from "@/bridge/monitor/cctp/CctpMonitor";
import { NOOP_LOGGER } from "@/logger";

function makeMonitor(): CctpMonitor {
  return new CctpMonitor({
    chainId: ChainId.SEPOLIA,
    starknetProvider: {} as RpcProvider,
    ethereumProvider: {} as Provider,
    logger: NOOP_LOGGER,
  });
}

describe("CctpMonitor state machines (fixture inputs)", () => {
  const m = makeMonitor();

  describe("getDepositState", () => {
    it("maps CONFIRMED_ON_STARKNET and COMPLETED_ON_STARKNET to COMPLETED", async () => {
      await expect(
        m.getDepositState({
          status: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
          externalTxHash: "0xl1",
        })
      ).resolves.toBe(DepositState.COMPLETED);

      await expect(
        m.getDepositState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          externalTxHash: "0xl1",
        })
      ).resolves.toBe(DepositState.COMPLETED);
    });

    it("maps ERROR to ERROR", async () => {
      await expect(
        m.getDepositState({
          status: BridgeTransferStatus.ERROR,
          externalTxHash: "0xl1",
        })
      ).resolves.toBe(DepositState.ERROR);
    });

    it("maps other statuses to PENDING", async () => {
      await expect(
        m.getDepositState({
          status: BridgeTransferStatus.CONFIRMED_ON_L1,
          externalTxHash: "0xl1",
        })
      ).resolves.toBe(DepositState.PENDING);
    });
  });

  describe("getWithdrawalState", () => {
    it("maps COMPLETED_ON_L1 to COMPLETED", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_L1,
          protocol: "cctp",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.COMPLETED);
    });

    it("maps COMPLETED_ON_STARKNET with attestation + message to READY_TO_CLAIM", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          protocol: "cctp",
          starknetTxHash: "0xsn",
          attestation: "0xattest",
          message: "0xmsg",
        })
      ).resolves.toBe(WithdrawalState.READY_TO_CLAIM);
    });

    it("maps COMPLETED_ON_STARKNET without attestation fields to PENDING", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          protocol: "cctp",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.PENDING);
    });

    it("maps ERROR to ERROR", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.ERROR,
          protocol: "cctp",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.ERROR);
    });

    it("maps other statuses to PENDING", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
          protocol: "cctp",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.PENDING);
    });
  });
});

describe("CctpMonitor.inferBlockRange", () => {
  type Inferrer = {
    inferBlockRange(l1Timestamp: number): Promise<{
      fromBlock: number;
      toBlock: number;
    }>;
  };

  function monitorWithBlocks(blocks: Array<{ number: number; ts: number }>) {
    const latest = blocks[blocks.length - 1]!;
    const getBlock = vi.fn(async (id?: number) => {
      const wanted = id ?? latest.number;
      const block = blocks.find((b) => b.number === wanted);
      if (!block) throw new Error(`Block ${wanted} not found`);
      return { block_number: block.number, timestamp: block.ts };
    });
    const monitor = new CctpMonitor({
      chainId: ChainId.SEPOLIA,
      starknetProvider: { getBlock } as unknown as RpcProvider,
      ethereumProvider: {} as Provider,
      logger: NOOP_LOGGER,
    }) as unknown as Inferrer;
    return { monitor, getBlock };
  }

  it("samples ten blocks back on a mature chain", async () => {
    const { monitor, getBlock } = monitorWithBlocks([
      { number: 990, ts: 1000 },
      { number: 1000, ts: 1300 },
    ]);
    const range = await monitor.inferBlockRange(1300);
    expect(getBlock).toHaveBeenCalledWith(990);
    expect(range.toBlock).toBeLessThanOrEqual(1000);
    expect(range.fromBlock).toBeGreaterThanOrEqual(0);
  });

  it("clamps the sample to genesis on a chain younger than the window", async () => {
    // Fewer than SAMPLE_BLOCKS blocks: the old code asked for block -7.
    const { monitor, getBlock } = monitorWithBlocks([
      { number: 0, ts: 1000 },
      { number: 3, ts: 1090 },
    ]);
    const range = await monitor.inferBlockRange(1090);
    expect(getBlock).toHaveBeenCalledWith(0);
    expect(range).toEqual({ fromBlock: 0, toBlock: 3 });
  });

  it("needs no sample at genesis", async () => {
    const { monitor, getBlock } = monitorWithBlocks([{ number: 0, ts: 1000 }]);
    const range = await monitor.inferBlockRange(1000);
    expect(getBlock).toHaveBeenCalledTimes(1);
    expect(range).toEqual({ fromBlock: 0, toBlock: 0 });
  });
});
