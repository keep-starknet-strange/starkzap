import type { RpcProvider } from "starknet";
import type { Provider } from "ethers";
import type { ChainId } from "@/types";
import { resolveFetch } from "@/utils";
import type { BridgeMonitorInterface } from "@/bridge/monitor/BridgeMonitorInterface";
import {
  type WithdrawMonitorResult,
  type CctpWithdrawMonitorResult,
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
import {
  getCircleApiBaseUrl,
  STARKNET_DOMAIN_ID,
} from "@/bridge/ethereum/cctp/constants";

export interface CctpMonitorOptions {
  chainId: ChainId;
  starknetProvider: RpcProvider;
  ethereumProvider: Provider;
  fetchFn?: typeof fetch;
}

interface CCTPMessagesResponse {
  messages: CCTPMessage[];
}

interface CCTPMessage {
  attestation: string;
  message: string | null;
  decodedMessage: {
    nonce: string;
    decodedMessageBody: {
      expirationBlock: string;
    } | null;
  } | null;
  status: "pending_confirmations" | "complete";
}

interface AttestationData {
  status: "complete" | "pending";
  attestation?: string;
  message?: string;
  nonce?: string;
  expirationBlock?: number;
}

export class CctpMonitor implements BridgeMonitorInterface {
  private readonly chainId: ChainId;
  private readonly starknetProvider: RpcProvider;
  private readonly ethereumProvider: Provider;
  private readonly fetchFn: typeof fetch;

  constructor(options: CctpMonitorOptions) {
    this.chainId = options.chainId;
    this.starknetProvider = options.starknetProvider;
    this.ethereumProvider = options.ethereumProvider;
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

    // For CCTP deposits, we can only check the L1 burn tx status.
    // The L2 mint tx hash cannot be deterministically derived without Circle's API.
    // TODO
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
    const base: Omit<CctpWithdrawMonitorResult, "status"> = {
      protocol: "cctp",
      starknetTxHash: snTxHash,
    };

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

    // Only check Circle once the Starknet burn tx has reached soft finality.
    if (
      snStatus !== BridgeTransferStatus.CONFIRMED_ON_STARKNET &&
      snStatus !== BridgeTransferStatus.COMPLETED_ON_STARKNET
    ) {
      return { ...base, status: snStatus };
    }

    // Try to fetch the Circle attestation (non-blocking single attempt).
    const attestation = await this.tryFetchAttestation(snTxHash);

    if (!attestation) {
      // Starknet finalized but Circle hasn't attested yet.
      return { ...base, status: snStatus };
    }

    if (
      attestation.status === "complete" &&
      attestation.attestation &&
      attestation.message
    ) {
      return {
        ...base,
        status: BridgeTransferStatus.COMPLETED_ON_STARKNET,
        attestation: attestation.attestation,
        message: attestation.message,
        ...(attestation.nonce !== undefined && { nonce: attestation.nonce }),
        ...(attestation.expirationBlock !== undefined && {
          expirationBlock: attestation.expirationBlock,
        }),
      };
    }

    // pending
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
      case BridgeTransferStatus.COMPLETED_ON_STARKNET: {
        // CCTP requires a Circle attestation before the user can claim on L1.
        const cctpResult = result as CctpWithdrawMonitorResult;
        return cctpResult.attestation && cctpResult.message
          ? WithdrawalState.READY_TO_CLAIM
          : WithdrawalState.PENDING;
      }
      case BridgeTransferStatus.ERROR:
        return WithdrawalState.ERROR;
      default:
        return WithdrawalState.PENDING;
    }
  }

  private async tryFetchAttestation(
    snTxHash: string
  ): Promise<AttestationData | null> {
    const baseUrl = getCircleApiBaseUrl(this.chainId);
    const url = `${baseUrl}/v2/messages/${STARKNET_DOMAIN_ID}?transactionHash=${snTxHash}`;

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as CCTPMessagesResponse;

      const message = data.messages[0] ?? null;
      if (message) {
        const isComplete =
          message.status === "complete" && message.attestation !== "PENDING";

        const expirationBlockRaw =
          message.decodedMessage?.decodedMessageBody?.expirationBlock;
        const expirationBlockNum =
          expirationBlockRaw !== undefined
            ? Number(expirationBlockRaw)
            : undefined;
        // expirationBlock of 0 means no expiration
        const expirationBlock =
          expirationBlockNum !== undefined && expirationBlockNum > 0
            ? expirationBlockNum
            : undefined;

        return {
          status: isComplete ? "complete" : "pending",
          ...(isComplete && { attestation: message.attestation }),
          ...(message.message !== null && { message: message.message }),
          ...(message.decodedMessage?.nonce !== undefined && {
            nonce: message.decodedMessage.nonce,
          }),
          ...(expirationBlock !== undefined && { expirationBlock }),
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}
