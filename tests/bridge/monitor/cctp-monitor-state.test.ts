import { describe, expect, it } from "vitest";
import type { Provider } from "ethers";
import type { RpcProvider } from "starknet";
import { ChainId } from "@/types";
import {
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { CctpMonitor } from "@/bridge/monitor/cctp/CctpMonitor";

function makeMonitor(): CctpMonitor {
  return new CctpMonitor({
    chainId: ChainId.SEPOLIA,
    starknetProvider: {} as RpcProvider,
    ethereumProvider: {} as Provider,
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
