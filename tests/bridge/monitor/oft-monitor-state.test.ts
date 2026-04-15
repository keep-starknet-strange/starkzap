import { describe, expect, it } from "vitest";
import type { Provider } from "ethers";
import type { RpcProvider } from "starknet";
import { ChainId } from "@/types";
import { Protocol } from "@/types/bridge/protocol";
import {
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { OftMonitor } from "@/bridge/monitor/oft/OftMonitor";

function makeMonitor(): OftMonitor {
  return new OftMonitor({
    chainId: ChainId.SEPOLIA,
    starknetProvider: {} as RpcProvider,
    ethereumProvider: {} as Provider,
    protocol: Protocol.OFT,
  });
}

describe("OftMonitor state machines (fixture inputs)", () => {
  const m = makeMonitor();

  describe("getDepositState", () => {
    it("matches Cctp/Canonical deposit mapping", async () => {
      await expect(
        m.getDepositState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          externalTxHash: "0xl1",
        })
      ).resolves.toBe(DepositState.COMPLETED);
    });
  });

  describe("getWithdrawalState", () => {
    it("maps COMPLETED_ON_L1 to COMPLETED", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_L1,
          protocol: "oft",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.COMPLETED);
    });

    it("does not use READY_TO_CLAIM for COMPLETED_ON_STARKNET (OFT)", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          protocol: "oft",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.PENDING);
    });

    it("maps ERROR to ERROR", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.ERROR,
          protocol: "oft",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.ERROR);
    });
  });
});
