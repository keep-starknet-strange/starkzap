import type { RpcProvider } from "starknet";
import type { Provider } from "ethers";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";
import {
  BridgeTransferStatus,
  type DepositMonitorResult,
  DepositState,
  type DepositStateInput,
  WithdrawalState,
  type WithdrawalStateInput,
  type WithdrawMonitorResult,
} from "@/bridge/monitor/types";
import {
  checkStarknetTxStatus,
  getEthereumTxStatus,
} from "@/bridge/monitor/utils";
import type { Protocol } from "@/types/bridge/protocol";

export interface OftMonitorOptions {
  starknetProvider: RpcProvider;
  ethereumProvider: Provider;
  protocol: Protocol.OFT | Protocol.OFT_MIGRATED;
}

/**
 * OFT bridge monitor.
 *
 * OFT withdrawals are delivered automatically by the LayerZero relayer —
 * there is no manual L1 completion step. Passing an `externalTxHash` to
 * `monitorWithdraw` is therefore unsupported and will throw.
 */
export class OftMonitor implements BridgeMonitorInterface {
  protected readonly starknetProvider: RpcProvider;
  protected readonly ethereumProvider: Provider;
  protected readonly protocol: Protocol.OFT | Protocol.OFT_MIGRATED;

  constructor(options: OftMonitorOptions) {
    this.starknetProvider = options.starknetProvider;
    this.ethereumProvider = options.ethereumProvider;
    this.protocol = options.protocol;
  }

  async monitorDeposit(
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult> {
    if (starknetTxHash) {
      const status = await checkStarknetTxStatus(
        starknetTxHash,
        this.starknetProvider
      );
      return { status, externalTxHash, starknetTxHash };
    }

    const { status } = await getEthereumTxStatus(
      externalTxHash,
      this.ethereumProvider
    );
    return { status, externalTxHash };
  }

  async monitorWithdrawal(
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    if (externalTxHash !== undefined) {
      throw new Error(
        `OFT withdrawals are delivered automatically by the LayerZero relayer — ` +
          `there is no external completion transaction to monitor. ` +
          `Do not pass externalTxHash for protocol "${this.protocol}".`
      );
    }

    const status = await checkStarknetTxStatus(snTxHash, this.starknetProvider);

    return {
      protocol: this.protocol as "oft" | "oft-migrated",
      starknetTxHash: snTxHash,
      status,
    };
  }

  async getDepositState(param: DepositStateInput): Promise<DepositState> {
    const result =
      "status" in param
        ? param
        : await this.monitorDeposit(param.externalTxHash, param.starknetTxHash);

    switch (result.status) {
      case BridgeTransferStatus.CONFIRMED_ON_STARKNET:
      case BridgeTransferStatus.COMPLETED_ON_STARKNET:
        return DepositState.COMPLETED;
      case BridgeTransferStatus.ERROR:
        return DepositState.ERROR;
      default:
        return DepositState.PENDING;
    }
  }

  async getWithdrawalState(
    param: WithdrawalStateInput
  ): Promise<WithdrawalState> {
    const result =
      "status" in param
        ? param
        : await this.monitorWithdrawal(
            param.starknetTxHash,
            param.externalTxHash
          );

    switch (result.status) {
      case BridgeTransferStatus.CONFIRMED_ON_STARKNET:
      case BridgeTransferStatus.COMPLETED_ON_STARKNET:
        // OFT withdrawals are delivered automatically — no manual step needed.
        return WithdrawalState.COMPLETED;
      case BridgeTransferStatus.ERROR:
        return WithdrawalState.ERROR;
      default:
        return WithdrawalState.PENDING;
    }
  }
}
