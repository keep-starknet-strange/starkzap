import type { RpcProvider } from "starknet";
import { dataSlice, type Provider } from "ethers";
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

const LAYERZERO_API_BASE = "https://transfer.layerzero-api.com/v1";
const LAYERZERO_SCAN_MAINNET = "https://scan.layerzero-api.com/v1";
const LAYERZERO_SCAN_TESTNET = "https://scan-testnet.layerzero-api.com/v1";

// Selector for execute(tuple[] _calls, bytes32 _quoteId)
const EXECUTE_SELECTOR = "0x571d3dc7";

interface LayerZeroTransferStatus {
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  explorerUrl?: string;
  executionHistory?: LayerZeroExecutionHistoryItem[];
}

interface LayerZeroExecutionHistoryItem {
  event: "SENT" | "BUS_RODE" | "DELIVERED";
  transaction: {
    chainKey: string;
    hash: string;
    timestamp: number;
  };
}

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
  layerZeroApiKey: string;
  fetchFn?: typeof fetch;
}

/**
 * OFT bridge monitor.
 *
 * OFT withdrawals are delivered automatically by the LayerZero relayer —
 * there is no manual L1 completion step. Passing an `externalTxHash` to
 * `monitorWithdraw` is therefore unsupported and will throw.
 */
export class OftMonitor implements BridgeMonitorInterface {
  protected readonly chainId: ChainId;
  protected readonly starknetProvider: RpcProvider;
  protected readonly ethereumProvider: Provider;
  protected readonly protocol: Protocol.OFT | Protocol.OFT_MIGRATED;
  protected readonly fetchFn: typeof fetch;
  protected readonly layerZeroApiKey: string;

  constructor(options: OftMonitorOptions) {
    this.chainId = options.chainId;
    this.starknetProvider = options.starknetProvider;
    this.ethereumProvider = options.ethereumProvider;
    this.protocol = options.protocol;
    this.layerZeroApiKey = options.layerZeroApiKey;
    this.fetchFn = resolveFetch(options.fetchFn);
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

    const { status: l1Status } = await getEthereumTxStatus(
      externalTxHash,
      this.ethereumProvider
    );

    if (l1Status !== BridgeTransferStatus.CONFIRMED_ON_L1) {
      return { status: l1Status, externalTxHash };
    }

    // L1 confirmed — extract quoteId from the tx input and query LayerZero.
    const quoteId = await this.extractQuoteId(externalTxHash);
    if (!quoteId) {
      return { status: BridgeTransferStatus.CONFIRMED_ON_L1, externalTxHash };
    }

    const lzStatus = await this.fetchLayerZeroStatus(quoteId, externalTxHash);
    console.log(lzStatus);
    if (!lzStatus) {
      return { status: BridgeTransferStatus.CONFIRMED_ON_L1, externalTxHash };
    }

    switch (lzStatus.status) {
      case "SUCCEEDED": {
        const snTxHash = lzStatus.executionHistory?.find(
          (h) => h.event === "DELIVERED"
        )?.transaction.hash;
        if (snTxHash) {
          const snStatus = await checkStarknetTxStatus(
            snTxHash,
            this.starknetProvider
          );
          return { status: snStatus, externalTxHash, starknetTxHash: snTxHash };
        }
        return {
          status: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
          externalTxHash,
        };
      }
      case "PROCESSING":
        return {
          status: BridgeTransferStatus.SUBMITTED_ON_STARKNET,
          externalTxHash,
        };
      case "FAILED":
        return { status: BridgeTransferStatus.ERROR, externalTxHash };
      default:
        // PENDING / UNKNOWN — relayer hasn't picked it up yet
        return {
          status: BridgeTransferStatus.CONFIRMED_ON_L1,
          externalTxHash,
        };
    }
  }

  private async extractQuoteId(txHash: string): Promise<string | null> {
    try {
      const tx = await this.ethereumProvider.getTransaction(txHash);
      if (!tx?.data.startsWith(EXECUTE_SELECTOR)) return null;
      // execute(tuple[] _calls, bytes32 _quoteId)
      // ABI layout after 4-byte selector:
      //   word[0] = offset to _calls (dynamic)
      //   word[1] = _quoteId (bytes32, static)
      return dataSlice(tx.data, 4 + 32, 4 + 32 + 32);
    } catch {
      return null;
    }
  }

  private async fetchLayerZeroStatus(
    quoteId: string,
    txHash: string
  ): Promise<LayerZeroTransferStatus | null> {
    try {
      const response = await this.fetchFn(
        `${LAYERZERO_API_BASE}/status/${quoteId}?txHash=${txHash}`,
        {
          headers: {
            Accept: "application/json",
            ...(this.layerZeroApiKey
              ? { "x-api-key": this.layerZeroApiKey }
              : {}),
          },
        }
      );
      if (!response.ok) return null;
      return (await response.json()) as LayerZeroTransferStatus;
    } catch {
      return null;
    }
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
      this.starknetProvider
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

    const { bridgeStatus, externalTxHash: deliveredTxHash } =
      mapLzMessage(lzMessage);

    return {
      ...base,
      status: bridgeStatus ?? snStatus,
      ...(deliveredTxHash && { externalTxHash: deliveredTxHash }),
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
      case BridgeTransferStatus.COMPLETED_ON_L1:
        return WithdrawalState.COMPLETED;
      case BridgeTransferStatus.ERROR:
        return WithdrawalState.ERROR;
      default:
        return WithdrawalState.PENDING;
    }
  }

  private async tryFetchLayerZeroMessage(
    snTxHash: string
  ): Promise<LayerZeroMessage | null> {
    const baseUrl = this.chainId.isMainnet()
      ? LAYERZERO_SCAN_MAINNET
      : LAYERZERO_SCAN_TESTNET;
    const url = `${baseUrl}/messages/tx/${snTxHash}`;

    try {
      const response = await this.fetchFn(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as LzMessagesResponse;
      return data.data[0] ?? null;
    } catch {
      return null;
    }
  }
}

function mapLzMessage(msg: LayerZeroMessage): {
  bridgeStatus: BridgeTransferStatus | null;
  externalTxHash: string | null;
} {
  const overall = msg.status.name;
  const dst = msg.destination;

  if (
    overall === "DELIVERED" &&
    dst?.status === "SUCCEEDED" &&
    dst.tx?.txHash
  ) {
    return {
      bridgeStatus: BridgeTransferStatus.COMPLETED_ON_L1,
      externalTxHash: dst.tx.txHash,
    };
  }

  if (overall === "FAILED" || dst?.status === "FAILED") {
    return { bridgeStatus: BridgeTransferStatus.ERROR, externalTxHash: null };
  }

  // INFLIGHT / CONFIRMING / BLOCKED / etc. — still in transit
  return { bridgeStatus: null, externalTxHash: null };
}
