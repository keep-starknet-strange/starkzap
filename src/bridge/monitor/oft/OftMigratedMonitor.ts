import type { Provider } from "ethers";
import type { RpcProvider } from "starknet";
import { OftMonitor } from "@/bridge/monitor/oft/OftMonitor";
import {
  BridgeTransferStatus,
  type OftWithdrawMonitorResult,
  type WithdrawMonitorResult,
  type WithdrawalStateInput,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { getEthereumTxStatus } from "@/bridge/monitor/utils";
import { resolveFetch } from "@/utils";
import type { ChainId } from "@/types";
import { Protocol } from "@/types/bridge/protocol";

const LAYER_ZERO_SCAN_MAINNET = "https://scan.layerzero-api.com/v1";
const LAYER_ZERO_SCAN_TESTNET = "https://scan-testnet.layerzero-api.com/v1";

function getLayerZeroScanBaseUrl(chainId: ChainId): string {
  return chainId.isMainnet()
    ? LAYER_ZERO_SCAN_MAINNET
    : LAYER_ZERO_SCAN_TESTNET;
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

export interface OftMigratedMonitorOptions {
  chainId: ChainId;
  starknetProvider: RpcProvider;
  ethereumProvider: Provider;
  fetchFn?: typeof fetch;
}

/**
 * OFT_MIGRATED bridge monitor.
 *
 * Queries the LayerZero Scan API (`/messages/tx/{snTxHash}`) to track
 * cross-chain delivery and surface the Ethereum destination tx hash once
 * the LayerZero relayer has executed the `lzReceive` call on L1.
 */
export class OftMigratedMonitor extends OftMonitor {
  private readonly chainId: ChainId;
  private readonly fetchFn: typeof fetch;

  constructor(options: OftMigratedMonitorOptions) {
    super({ ...options, protocol: Protocol.OFT_MIGRATED });
    this.chainId = options.chainId;
    this.fetchFn = resolveFetch(options.fetchFn);
  }

  override async monitorWithdrawal(
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    const base: Omit<OftWithdrawMonitorResult, "status"> = {
      protocol: "oft-migrated",
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

    // Check Starknet tx status first.
    const snStatus = await this.checkSnStatus(snTxHash);

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

  override async getWithdrawalState(
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

  private async checkSnStatus(snTxHash: string): Promise<BridgeTransferStatus> {
    const { checkStarknetTxStatus } = await import("@/bridge/monitor/utils");
    return checkStarknetTxStatus(snTxHash, this.starknetProvider);
  }

  private async tryFetchLayerZeroMessage(
    snTxHash: string
  ): Promise<LayerZeroMessage | null> {
    const baseUrl = getLayerZeroScanBaseUrl(this.chainId);
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
      externalTxHash: dst.tx?.txHash,
    };
  }

  if (overall === "FAILED" || dst?.status === "FAILED") {
    return { bridgeStatus: BridgeTransferStatus.ERROR, externalTxHash: null };
  }

  // INFLIGHT / CONFIRMING / BLOCKED / etc. — still in transit
  return { bridgeStatus: null, externalTxHash: null };
}
