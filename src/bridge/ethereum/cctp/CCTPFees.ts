import type { ChainId } from "@/types";
import { type StarkZapLogger } from "@/logger";
import {
  ETH_FAST_TRANSFER_FEE_BP,
  ETHEREUM_DOMAIN_ID,
  getCircleApiBaseUrl,
  getFinalityThreshold,
  STARKNET_DOMAIN_ID,
  STARKNET_FAST_TRANSFER_FEE_BP,
} from "@/bridge/ethereum/cctp/constants";

interface CCTPFeeResponse {
  data: CCTPFeeData[];
}

interface CCTPFeeData {
  finalityThreshold: number;
  minimumFee: number; // in basis points (1 = 0.01%)
}

export enum BridgeDirection {
  WITHDRAW_FROM_STARKNET,
  DEPOSIT_TO_STARKNET,
}

export class CCTPFees {
  constructor(private readonly logger: StarkZapLogger) {}

  async getMinimumFeeBps(
    direction: BridgeDirection,
    chainId: ChainId,
    fastTransfer?: boolean
  ): Promise<number> {
    try {
      const feeData = await this.fetchFees(direction, chainId);
      const targetThreshold = getFinalityThreshold(fastTransfer);
      const fee = feeData.find((f) => f.finalityThreshold === targetThreshold);
      return fee?.minimumFee ?? this.getFallbackFee(direction, fastTransfer);
    } catch (error) {
      this.logger.error("Failed to get transfer fee, using fallback:", error);
      return this.getFallbackFee(direction, fastTransfer);
    }
  }

  private async fetchFees(
    direction: BridgeDirection,
    chainId: ChainId
  ): Promise<CCTPFeeData[]> {
    const source =
      direction === BridgeDirection.DEPOSIT_TO_STARKNET
        ? ETHEREUM_DOMAIN_ID
        : STARKNET_DOMAIN_ID;
    const destination =
      direction === BridgeDirection.DEPOSIT_TO_STARKNET
        ? STARKNET_DOMAIN_ID
        : ETHEREUM_DOMAIN_ID;

    const domainUrl = getCircleApiBaseUrl(chainId);
    const url = `${domainUrl}/v2/burn/USDC/fees/${source}/${destination}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch fees from Circle API: ${response.statusText}`
      );
    }

    const data = (await response.json()) as CCTPFeeResponse;
    return data.data;
  }

  private getFallbackFee(
    direction: BridgeDirection,
    fastTransfer?: boolean
  ): number {
    if (!fastTransfer) {
      return 0;
    }

    return direction === BridgeDirection.DEPOSIT_TO_STARKNET
      ? ETH_FAST_TRANSFER_FEE_BP
      : STARKNET_FAST_TRANSFER_FEE_BP;
  }
}
