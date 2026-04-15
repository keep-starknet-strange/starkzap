import { describe, expect, it } from "vitest";
import type { Provider } from "ethers";
import type { RpcProvider } from "starknet";
import { ChainId } from "@/types";
import {
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { CanonicalMonitor } from "@/bridge/monitor/canonical/CanonicalMonitor";

function makeMonitor(): CanonicalMonitor {
  return new CanonicalMonitor({
    chainId: ChainId.SEPOLIA,
    starknetProvider: {} as RpcProvider,
    ethereumProvider: {} as Provider,
  });
}

describe("CanonicalMonitor state machines (fixture inputs)", () => {
  const m = makeMonitor();

  describe("getDepositState", () => {
    it("maps terminal Starknet statuses to COMPLETED", async () => {
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
  });

  describe("getWithdrawalState", () => {
    it("maps COMPLETED_ON_L1 to COMPLETED", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_L1,
          protocol: "canonical",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.COMPLETED);
    });

    it("maps COMPLETED_ON_STARKNET to READY_TO_CLAIM (no extra attestation gate)", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
          protocol: "canonical",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.READY_TO_CLAIM);
    });

    it("maps ERROR to ERROR", async () => {
      await expect(
        m.getWithdrawalState({
          status: BridgeTransferStatus.ERROR,
          protocol: "canonical",
          starknetTxHash: "0xsn",
        })
      ).resolves.toBe(WithdrawalState.ERROR);
    });
  });
});
