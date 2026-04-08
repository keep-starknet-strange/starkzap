import type { RpcProvider } from "starknet";
import type { Provider } from "ethers";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";
import {
  BridgeTransferStatus,
  type DepositMonitorResult,
  DepositState,
  type DepositStateInput,
  type OftWithdrawMonitorResult,
  WithdrawalState,
  type WithdrawalStateInput,
  type WithdrawMonitorResult,
} from "@/bridge/monitor/types";
import {
  checkStarknetTxStatus,
  getEthereumTxStatus,
} from "@/bridge/monitor/utils";
import type { ChainId } from "@/types";
import type { Protocol } from "@/types/bridge/protocol";
import { resolveFetch } from "@/utils";
import type { StarkZapLogger } from "@/logger";

const LAYERZERO_SCAN_MAINNET = "https://scan.layerzero-api.com/v1";
const LAYERZERO_SCAN_TESTNET = "https://scan-testnet.layerzero-api.com/v1";

interface LayerZeroMessage {
  status: { name: string };
  source: { txHash: string; status: string };
  destination: {
    status: string;
    tx: { txHash: string } | null;
  } | null;
}

interface LzMessagesResponse {
  data: LayerZeroMessage[];
}

export interface OftMonitorOptions {
  chainId: ChainId;
  starknetProvider: RpcProvider;
  ethereumProvider: Provider;
  protocol: Protocol.OFT | Protocol.OFT_MIGRATED;
  fetchFn?: typeof fetch;
  logger: StarkZapLogger;
}

export class OftMonitor implements BridgeMonitorInterface {
  protected readonly chainId: ChainId;
  protected readonly starknetProvider: RpcProvider;
  protected readonly ethereumProvider: Provider;
  protected readonly protocol: Protocol.OFT | Protocol.OFT_MIGRATED;
  protected readonly fetchFn: typeof fetch;
  private readonly logger: StarkZapLogger;

  constructor(options: OftMonitorOptions) {
    this.chainId = options.chainId;
    this.starknetProvider = options.starknetProvider;
    this.ethereumProvider = options.ethereumProvider;
    this.protocol = options.protocol;
    this.fetchFn = resolveFetch(options.fetchFn);
    this.logger = options.logger;
  }

  async monitorDeposit(
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult> {
    if (starknetTxHash) {
      const status = await checkStarknetTxStatus(
        starknetTxHash,
        this.starknetProvider,
        this.logger
      );
      return { status, externalTxHash, starknetTxHash };
    }

    const { status: l1Status } = await getEthereumTxStatus(
      externalTxHash,
      this.ethereumProvider
    );

    if (l1Status !== BridgeTransferStatus.CONFIRMED_ON_L1) {
      return { status: l1Status, externalTxHash };
    }

    // L1 confirmed — query LayerZero Scan API for cross-chain delivery status.
    const lzMessage = await this.tryFetchLayerZeroMessage(externalTxHash);
    if (!lzMessage) {
      return { status: BridgeTransferStatus.CONFIRMED_ON_L1, externalTxHash };
    }

    const overall = lzMessage.status.name;
    const dst = lzMessage.destination;
    if (overall === "FAILED" || dst?.status === "FAILED") {
      return { status: BridgeTransferStatus.ERROR, externalTxHash };
    }

    if (
      overall === "DELIVERED" &&
      dst?.status === "SUCCEEDED" &&
      dst.tx?.txHash
    ) {
      const snTxHash = dst.tx.txHash;
      const snStatus = await checkStarknetTxStatus(
        snTxHash,
        this.starknetProvider,
        this.logger
      );
      return { status: snStatus, externalTxHash, starknetTxHash: snTxHash };
    }

    // Relayer has picked it up but not yet delivered — in transit.
    return {
      status: BridgeTransferStatus.SUBMITTED_ON_STARKNET,
      externalTxHash,
    };
  }

  async monitorWithdrawal(
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    const base: Omit<OftWithdrawMonitorResult, "status"> = {
      protocol: this.protocol as "oft" | "oft-migrated",
      starknetTxHash: snTxHash,
    };

    // If the L1 delivery tx hash is already known, check it directly.
    if (externalTxHash) {
      const { status: l1Status } = await getEthereumTxStatus(
        externalTxHash,
        this.ethereumProvider
      );
      const completedStatus =
        l1Status === BridgeTransferStatus.CONFIRMED_ON_L1
          ? BridgeTransferStatus.COMPLETED_ON_L1
          : l1Status;
      return { ...base, status: completedStatus, externalTxHash };
    }

    const snStatus = await checkStarknetTxStatus(
      snTxHash,
      this.starknetProvider,
      this.logger
    );

    // Only query LayerZero once the Starknet tx has reached soft finality.
    if (
      snStatus !== BridgeTransferStatus.CONFIRMED_ON_STARKNET &&
      snStatus !== BridgeTransferStatus.COMPLETED_ON_STARKNET
    ) {
      return { ...base, status: snStatus };
    }

    const lzMessage = await this.tryFetchLayerZeroMessage(snTxHash);
    if (!lzMessage) {
      return { ...base, status: snStatus };
    }

    const overall = lzMessage.status.name;
    const dst = lzMessage.destination;
    if (overall === "FAILED" || dst?.status === "FAILED") {
      return { ...base, status: BridgeTransferStatus.ERROR };
    }

    if (
      overall === "DELIVERED" &&
      dst?.status === "SUCCEEDED" &&
      dst.tx?.txHash
    ) {
      return {
        ...base,
        status: BridgeTransferStatus.COMPLETED_ON_L1,
        externalTxHash: dst.tx.txHash,
      };
    }

    // INFLIGHT / CONFIRMING / BLOCKED / etc. — still in transit.
    return { ...base, status: snStatus };
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
      case BridgeTransferStatus.ERROR:
        return WithdrawalState.ERROR;
      default:
        return WithdrawalState.PENDING;
    }
  }

  private async tryFetchLayerZeroMessage(
    txHash: string
  ): Promise<LayerZeroMessage | null> {
    const baseUrl = this.chainId.isMainnet()
      ? LAYERZERO_SCAN_MAINNET
      : LAYERZERO_SCAN_TESTNET;

    try {
      const response = await this.fetchFn(`${baseUrl}/messages/tx/${txHash}`, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as LzMessagesResponse;
      return data.data[0] ?? null;
    } catch (e) {
      this.logger.debug("[OftMonitor] tryFetchLayerZeroMessage failed:", e);
      return null;
    }
  }
}
