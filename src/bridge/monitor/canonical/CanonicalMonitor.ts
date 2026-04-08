import type { RpcProvider } from "starknet";
import type { Provider } from "ethers";
import type { ChainId } from "@/types";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";
import {
  type WithdrawMonitorResult,
  type DepositMonitorResult,
  type WithdrawalStateInput,
  BridgeTransferStatus,
  WithdrawalState,
  type DepositStateInput,
  DepositState,
} from "@/bridge/monitor/types";
import {
  checkStarknetTxStatus,
  getEthereumTxStatus,
} from "@/bridge/monitor/utils";
import { deriveStarknetDepositTxHash } from "@/bridge/monitor/canonical/utils";
import type { StarkZapLogger } from "@/logger";

export interface CanonicalMonitorOptions {
  chainId: ChainId;
  starknetProvider: RpcProvider;
  ethereumProvider: Provider;
  logger: StarkZapLogger;
}

export class CanonicalMonitor implements BridgeMonitorInterface {
  private readonly chainId: ChainId;
  private readonly starknetProvider: RpcProvider;
  private readonly ethereumProvider: Provider;
  private readonly logger: StarkZapLogger;

  constructor(options: CanonicalMonitorOptions) {
    this.chainId = options.chainId;
    this.starknetProvider = options.starknetProvider;
    this.ethereumProvider = options.ethereumProvider;
    this.logger = options.logger;
  }

  async monitorDeposit(
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult> {
    // If the Starknet tx hash is already known, skip L1 and check L2 directly.
    if (starknetTxHash) {
      const status = await checkStarknetTxStatus(
        starknetTxHash,
        this.starknetProvider,
        this.logger
      );
      return { status, externalTxHash, starknetTxHash };
    }

    const { status: l1Status, receipt } = await getEthereumTxStatus(
      externalTxHash,
      this.ethereumProvider
    );

    if (l1Status !== BridgeTransferStatus.CONFIRMED_ON_L1 || !receipt) {
      return { status: l1Status, externalTxHash };
    }

    // L1 tx confirmed — try to derive and check the L2 tx.
    const derivedSnTxHash = deriveStarknetDepositTxHash(
      receipt,
      this.chainId.toFelt252()
    );

    if (!derivedSnTxHash) {
      // Confirmed on L1 but no LogMessageToL2 event found.
      return { status: BridgeTransferStatus.CONFIRMED_ON_L1, externalTxHash };
    }

    const snStatus = await checkStarknetTxStatus(
      derivedSnTxHash,
      this.starknetProvider,
      this.logger
    );

    if (snStatus === BridgeTransferStatus.NOT_SUBMITTED_ON_STARKNET) {
      // L1 confirmed but L2 hasn't picked it up yet.
      return {
        status: BridgeTransferStatus.CONFIRMED_ON_L1,
        externalTxHash,
        starknetTxHash: derivedSnTxHash,
      };
    }

    return {
      status: snStatus,
      externalTxHash,
      starknetTxHash: derivedSnTxHash,
    };
  }

  async monitorWithdrawal(
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    const result = {
      protocol: "canonical" as const,
      starknetTxHash: snTxHash,
    };

    // If the L1 completion tx hash is known, check it directly.
    if (externalTxHash) {
      const { status } = await getEthereumTxStatus(
        externalTxHash,
        this.ethereumProvider
      );
      const completedStatus =
        status === BridgeTransferStatus.CONFIRMED_ON_L1
          ? BridgeTransferStatus.COMPLETED_ON_L1
          : status;
      return { ...result, status: completedStatus, externalTxHash };
    }

    const status = await checkStarknetTxStatus(
      snTxHash,
      this.starknetProvider,
      this.logger
    );
    return { ...result, status };
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
      case BridgeTransferStatus.COMPLETED_ON_L1:
        return WithdrawalState.COMPLETED;
      case BridgeTransferStatus.COMPLETED_ON_STARKNET:
        return WithdrawalState.READY_TO_CLAIM;
      case BridgeTransferStatus.ERROR:
        return WithdrawalState.ERROR;
      default:
        return WithdrawalState.PENDING;
    }
  }
}
