import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";
import {
  type DepositMonitorResult,
  type DepositStateInput,
  type WithdrawMonitorResult,
  type WithdrawalStateInput,
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
} from "@/bridge/monitor/types";
import { LayerswapApi } from "@/bridge/ethereum/layerswap/LayerswapApi";
import { normalizeLsTxHash } from "@/bridge/ethereum/layerswap/hashes";
import {
  LayerswapApiError,
  type LayerswapApiConfig,
  type LsSwap,
} from "@/bridge/ethereum/layerswap/types";
import type { StarkZapLogger } from "@/logger";

export interface LayerswapMonitorOptions {
  apiKey: string;
  logger: StarkZapLogger;
  baseUrl?: string;
}

/**
 * Layerswap lifecycle status → internal transfer-status mapping. Input for
 * deposit (`external → Starknet`) and withdrawal (`Starknet → external`)
 * differ only in which side is "source" vs "destination" — the swap lifecycle
 * itself is symmetric.
 */
export class LayerswapMonitor implements BridgeMonitorInterface {
  private readonly api: LayerswapApi;
  private readonly logger: StarkZapLogger;

  constructor(options: LayerswapMonitorOptions) {
    const apiConfig: LayerswapApiConfig = options.baseUrl
      ? { apiKey: options.apiKey, baseUrl: options.baseUrl }
      : { apiKey: options.apiKey };
    this.api = new LayerswapApi(apiConfig);
    this.logger = options.logger;
  }

  async monitorDeposit(
    externalTxHash: string,
    starknetTxHash?: string
  ): Promise<DepositMonitorResult> {
    const swap = await this.findSwapByHash(externalTxHash);
    if (!swap) {
      return {
        status: BridgeTransferStatus.NOT_SUBMITTED_ON_L1,
        externalTxHash,
        ...(starknetTxHash !== undefined && { starknetTxHash }),
      };
    }

    const resolvedStarknetTxHash = starknetTxHash ?? this.getOutputTxHash(swap);
    const status = this.swapStatusForDeposit(swap);

    return {
      status,
      externalTxHash,
      ...(resolvedStarknetTxHash !== undefined && {
        starknetTxHash: resolvedStarknetTxHash,
      }),
    };
  }

  async monitorWithdrawal(
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    const swap = await this.findSwapByHash(
      normalizeLsTxHash(snTxHash, "starknet")
    );
    if (!swap) {
      return {
        protocol: "layerswap",
        status: BridgeTransferStatus.NOT_SUBMITTED_ON_STARKNET,
        starknetTxHash: snTxHash,
        ...(externalTxHash !== undefined && { externalTxHash }),
      };
    }

    const resolvedExternalTxHash = externalTxHash ?? this.getOutputTxHash(swap);
    const status = this.swapStatusForWithdraw(swap);

    return {
      protocol: "layerswap",
      status,
      starknetTxHash: snTxHash,
      ...(resolvedExternalTxHash !== undefined && {
        externalTxHash: resolvedExternalTxHash,
      }),
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

  private async findSwapByHash(txHash: string): Promise<LsSwap | null> {
    try {
      const response = await this.api.getSwapByTransactionHash(txHash);
      return response.swap;
    } catch (e) {
      // 404 is the legitimate "swap not yet indexed" signal — surface it as
      // null so callers map it to NOT_SUBMITTED_*. Any other failure (rate
      // limit, 5xx, network) is propagated so a poller can retry rather than
      // misread a transient error as "not found".
      if (e instanceof LayerswapApiError && e.statusCode === 404) {
        return null;
      }
      this.logger.debug("[LayerswapMonitor] findSwapByHash failed:", e);
      throw e;
    }
  }

  private getOutputTxHash(swap: LsSwap): string | undefined {
    const output = swap.transactions.find(
      (t) => t.type === "output" && t.transaction_hash !== null
    );
    return output?.transaction_hash ?? undefined;
  }

  private swapStatusForDeposit(swap: LsSwap): BridgeTransferStatus {
    switch (swap.status) {
      case "created":
      case "user_transfer_pending":
      case "user_transfer_delayed":
        return BridgeTransferStatus.SUBMITTED_ON_L1;
      case "ls_transfer_pending":
        return BridgeTransferStatus.CONFIRMED_ON_L1;
      case "completed":
        return BridgeTransferStatus.CONFIRMED_ON_STARKNET;
      case "failed":
      case "expired":
      case "cancelled":
      case "pending_refund":
      case "refunded":
        return BridgeTransferStatus.ERROR;
    }
  }

  private swapStatusForWithdraw(swap: LsSwap): BridgeTransferStatus {
    switch (swap.status) {
      case "created":
      case "user_transfer_pending":
      case "user_transfer_delayed":
        return BridgeTransferStatus.SUBMITTED_ON_STARKNET;
      case "ls_transfer_pending":
        return BridgeTransferStatus.CONFIRMED_ON_STARKNET;
      case "completed":
        return BridgeTransferStatus.COMPLETED_ON_L1;
      case "failed":
      case "expired":
      case "cancelled":
      case "pending_refund":
      case "refunded":
        return BridgeTransferStatus.ERROR;
    }
  }
}
