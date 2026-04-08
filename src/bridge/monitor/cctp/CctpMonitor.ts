import { num, hash, type RpcProvider, uint256 } from "starknet";
import type { Provider } from "ethers";
import { type Address, type ChainId, fromAddress } from "@/types";
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
  ETHEREUM_DOMAIN_ID,
  getCircleApiBaseUrl,
  getTokenMessenger,
  STARKNET_DOMAIN_ID,
} from "@/bridge/ethereum/cctp/constants";
import type { StarkZapLogger } from "@/logger";

export interface CctpMonitorOptions {
  chainId: ChainId;
  starknetProvider: RpcProvider;
  ethereumProvider: Provider;
  fetchFn?: typeof fetch;
  logger: StarkZapLogger;
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

const SAMPLE_BLOCKS = 10;
// Extra backward margin to absorb avgBlockTime estimation error for old txs.
const SAFETY_BUFFER_BLOCKS = 100;
// Standard CCTP attestation can take up to ~20-30 min but relayer lag has been
// observed pushing delivery past 1 hour; use 2 hours to be safe.
const CCTP_MAX_RELAY_SECONDS = 7200;

export class CctpMonitor implements BridgeMonitorInterface {
  private readonly chainId: ChainId;
  private readonly starknetProvider: RpcProvider;
  private readonly ethereumProvider: Provider;
  private readonly fetchFn: typeof fetch;
  private readonly logger: StarkZapLogger;
  private messageTransmitterPromise: Promise<Address> | undefined;

  private messageReceivedKey = num.toHex(
    hash.starknetKeccak("MessageReceived")
  );

  constructor(options: CctpMonitorOptions) {
    this.chainId = options.chainId;
    this.starknetProvider = options.starknetProvider;
    this.ethereumProvider = options.ethereumProvider;
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

    const { status: l1Status, receipt } = await getEthereumTxStatus(
      externalTxHash,
      this.ethereumProvider
    );

    if (l1Status !== BridgeTransferStatus.CONFIRMED_ON_L1 || !receipt) {
      return { status: l1Status, externalTxHash };
    }

    // L1 confirmed — query Circle for the attestation nonce.
    const attestation = await this.tryFetchDepositAttestation(externalTxHash);

    if (
      !attestation ||
      attestation.status !== "complete" ||
      !attestation.nonce
    ) {
      return { status: BridgeTransferStatus.CONFIRMED_ON_L1, externalTxHash };
    }

    // Attestation complete — try to find the Starknet mint tx by nonce.
    const l1Block = await receipt.getBlock();
    const snTxHash = await this.findDepositTxOnSn(
      l1Block.timestamp,
      attestation.nonce
    );

    if (!snTxHash) {
      // Circle has attested but the relayer hasn't submitted on Starknet yet.
      return { status: BridgeTransferStatus.CONFIRMED_ON_L1, externalTxHash };
    }

    const snStatus = await checkStarknetTxStatus(
      snTxHash,
      this.starknetProvider,
      this.logger
    );
    return { status: snStatus, externalTxHash, starknetTxHash: snTxHash };
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
      this.starknetProvider,
      this.logger
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
        signal: AbortSignal.timeout(10_000),
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
    } catch (e) {
      this.logger.debug("[CctpMonitor] tryFetchAttestation failed:", e);
      return null;
    }
  }

  private async findDepositTxOnSn(
    l1Timestamp: number,
    nonce: string
  ): Promise<string | null> {
    try {
      const messageTransmitter = await this.getMessageTransmitter();
      const { fromBlock, toBlock } = await this.inferBlockRange(l1Timestamp);
      const { low: nonceLow, high: nonceHigh } = uint256.bnToUint256(
        BigInt(nonce)
      );

      const baseFilter = {
        address: messageTransmitter,
        keys: [
          [this.messageReceivedKey], // keys[0]: event selector
          [], // keys[1]: caller — ignore
          [num.toHex(nonceLow)], // keys[2]: nonce.low
          [num.toHex(nonceHigh)], // keys[3]: nonce.high
        ],
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        chunk_size: 100,
      };

      const MAX_PAGINATION_ITERATIONS = 20;
      let iterations = 0;
      let continuationToken: string | undefined;
      do {
        if (++iterations > MAX_PAGINATION_ITERATIONS) break;

        const response = await this.starknetProvider.getEvents({
          ...baseFilter,
          ...(continuationToken && { continuation_token: continuationToken }),
        });

        const match = response.events.find((e) => e.data[0] === "0x0"); // source_domain = Ethereum
        if (match) return match.transaction_hash;

        continuationToken = response.continuation_token;
      } while (continuationToken);

      return null;
    } catch (e) {
      this.logger.debug("[CctpMonitor] findDepositTxOnSn failed:", e);
      return null;
    }
  }

  private async tryFetchDepositAttestation(
    ethTxHash: string
  ): Promise<AttestationData | null> {
    const baseUrl = getCircleApiBaseUrl(this.chainId);
    const url = `${baseUrl}/v2/messages/${ETHEREUM_DOMAIN_ID}?transactionHash=${ethTxHash}`;

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as CCTPMessagesResponse;

      const message = data.messages[0] ?? null;
      if (!message) return null;

      const isComplete =
        message.status === "complete" && message.attestation !== "PENDING";
      return {
        status: isComplete ? "complete" : "pending",
        ...(message.decodedMessage?.nonce !== undefined && {
          nonce: message.decodedMessage.nonce,
        }),
      };
    } catch (e) {
      this.logger.debug("[CctpMonitor] tryFetchDepositAttestation failed:", e);
      return null;
    }
  }

  private async inferBlockRange(
    l1Timestamp: number
  ): Promise<{ fromBlock: number; toBlock: number }> {
    const latest = await this.starknetProvider.getBlock();
    const sample = await this.starknetProvider.getBlock(
      latest.block_number - SAMPLE_BLOCKS
    );
    const avgBlockTime = Math.max(
      1,
      (latest.timestamp - sample.timestamp) / SAMPLE_BLOCKS
    );

    const secondsSinceL1Confirm = latest.timestamp - l1Timestamp;
    const estimatedBlock =
      latest.block_number - Math.ceil(secondsSinceL1Confirm / avgBlockTime);

    return {
      fromBlock: Math.max(0, estimatedBlock - SAFETY_BUFFER_BLOCKS),
      toBlock: Math.min(
        latest.block_number,
        estimatedBlock + Math.ceil(CCTP_MAX_RELAY_SECONDS / avgBlockTime)
      ),
    };
  }

  private getMessageTransmitter(): Promise<Address> {
    if (!this.messageTransmitterPromise) {
      const p = this.starknetProvider
        .callContract({
          contractAddress: getTokenMessenger(this.chainId),
          entrypoint: "local_message_transmitter",
        })
        .then((result) => {
          if (!result[0])
            throw new Error("local_message_transmitter returned empty result");
          const address = num.toHex(result[0]);
          return fromAddress(address);
        })
        .catch((e) => {
          // Only clear the cache if this specific promise is still current,
          // to avoid evicting a replacement that was set by a concurrent caller.
          if (this.messageTransmitterPromise === p) {
            this.messageTransmitterPromise = undefined;
          }
          throw e;
        });
      this.messageTransmitterPromise = p;
    }
    return this.messageTransmitterPromise;
  }
}
