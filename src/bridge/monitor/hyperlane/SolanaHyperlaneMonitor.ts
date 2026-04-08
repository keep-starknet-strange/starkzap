import { hash, num, type RpcProvider, uint256 } from "starknet";
import type { Connection } from "@solana/web3.js";
import type { MultiProtocolProvider } from "@hyperlane-xyz/sdk";
import type { ChainId } from "@/types";
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
import { checkStarknetTxStatus } from "@/bridge/monitor/utils";
import type { HyperlaneRuntime } from "@/bridge/solana/hyperlaneRuntime";
import {
  hyperlaneChainName,
  setupMultiProtocolProvider,
} from "@/bridge/solana/registry";
import type { StarkZapLogger } from "@/logger";

export interface HyperlaneSolanaMonitorOptions {
  chainId: ChainId;
  starknetProvider: RpcProvider;
  solanaConnection: Connection;
  hyperlane: HyperlaneRuntime;
  logger: StarkZapLogger;
}

/**
 * Hyperlane bridge monitor for Starknet ↔ Solana routes.
 *
 * Withdrawals (Starknet → Solana) are delivered automatically by the
 * Hyperlane relayer — there is no manual completion step. Passing an
 * `externalTxHash` to `monitorWithdrawal` is therefore unsupported and
 * will throw.
 *
 * Deposits (Solana → Starknet) check the Solana source tx status when no
 * Starknet tx hash is available yet, then verify Starknet delivery via
 * the Hyperlane mailbox.
 *
 * Withdrawals (Starknet → Solana) check the Starknet tx status, then
 * verify Solana delivery via the Hyperlane mailbox.
 */
export class SolanaHyperlaneMonitor implements BridgeMonitorInterface {
  private readonly starknetProvider: RpcProvider;
  private readonly solanaConnection: Connection;
  private readonly hyperlane: HyperlaneRuntime;
  private readonly multiProtocolProvider: MultiProtocolProvider;
  private readonly starknetChainName: string;
  private readonly starknetMailbox: string;
  private readonly solanaChainName: string;
  private readonly solanaMailbox: string;
  private readonly logger: StarkZapLogger;

  private dispatchIdEventKey = num.toHex(hash.starknetKeccak("DispatchId"));

  constructor(options: HyperlaneSolanaMonitorOptions) {
    const { chainId, starknetProvider, solanaConnection, hyperlane, logger } =
      options;
    this.logger = logger;
    this.starknetProvider = starknetProvider;
    this.solanaConnection = solanaConnection;
    this.hyperlane = hyperlane;

    this.starknetChainName = hyperlaneChainName(chainId, "starknet");
    this.solanaChainName = hyperlaneChainName(chainId, "solana");
    this.starknetMailbox = chainId.isMainnet()
      ? hyperlane.registry.starknetAddresses.mailbox
      : hyperlane.registry.starknetsepoliaAddresses.mailbox;
    this.solanaMailbox = chainId.isMainnet()
      ? hyperlane.registry.solanamainnetAddresses.mailbox
      : hyperlane.registry.solanatestnetAddresses.mailbox;
    this.multiProtocolProvider = setupMultiProtocolProvider(
      { connection: solanaConnection },
      chainId,
      starknetProvider,
      hyperlane
    );
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

    const l1Status = await this.getSolanaTxStatus(externalTxHash);

    if (l1Status === BridgeTransferStatus.CONFIRMED_ON_L1) {
      const delivered = await this.checkStarknetDelivery(externalTxHash);
      if (delivered) {
        return {
          status: BridgeTransferStatus.CONFIRMED_ON_STARKNET,
          externalTxHash,
        };
      }
    }

    return { status: l1Status, externalTxHash };
  }

  async monitorWithdrawal(
    snTxHash: string,
    externalTxHash?: string
  ): Promise<WithdrawMonitorResult> {
    if (externalTxHash !== undefined) {
      throw new Error(
        `Hyperlane withdrawals are delivered automatically by the relayer — ` +
          `there is no external completion transaction to monitor. ` +
          `Do not pass externalTxHash for the Hyperlane protocol.`
      );
    }

    const snStatus = await checkStarknetTxStatus(
      snTxHash,
      this.starknetProvider,
      this.logger
    );
    const base = { protocol: "hyperlane" as const, starknetTxHash: snTxHash };

    if (
      snStatus === BridgeTransferStatus.CONFIRMED_ON_STARKNET ||
      snStatus === BridgeTransferStatus.COMPLETED_ON_STARKNET
    ) {
      const delivered = await this.checkSolanaDelivery(snTxHash);
      if (delivered) {
        // CONFIRMED_ON_L1 maps to COMPLETED in the withdrawal state machine.
        // "L1" here refers to the external destination chain (Solana), not Ethereum.
        return { ...base, status: BridgeTransferStatus.CONFIRMED_ON_L1 };
      }
    }

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
      case BridgeTransferStatus.CONFIRMED_ON_L1:
        return WithdrawalState.COMPLETED;
      case BridgeTransferStatus.ERROR:
        return WithdrawalState.ERROR;
      default:
        return WithdrawalState.PENDING;
    }
  }

  private async checkStarknetDelivery(signature: string): Promise<boolean> {
    try {
      const tx = await this.solanaConnection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      const logs = tx?.meta?.logMessages ?? [];
      const messages =
        this.hyperlane.sdk.SealevelCoreAdapter.parseMessageDispatchLogs(logs);

      if (messages.length === 0) return false;

      // Filter for messages targeting Starknet (match by resolved chain name).
      const starknetMessages = messages.filter((m) => {
        try {
          return (
            this.multiProtocolProvider.getChainName(m.destination) ===
            this.starknetChainName
          );
        } catch {
          return false;
        }
      });

      if (starknetMessages.length === 0) return false;

      const starknetAdapter = new this.hyperlane.sdk.StarknetCoreAdapter(
        this.starknetChainName,
        this.multiProtocolProvider,
        { mailbox: this.starknetMailbox }
      );

      for (const { messageId } of starknetMessages) {
        try {
          const delivered = await starknetAdapter.waitForMessageProcessed(
            messageId,
            this.starknetChainName,
            0,
            1
          );
          if (delivered) return true;
        } catch {
          // Not yet delivered — continue
        }
      }

      return false;
    } catch (e) {
      this.logger.debug(
        "[SolanaHyperlaneMonitor] checkStarknetDelivery failed:",
        e
      );
      return false;
    }
  }

  private async checkSolanaDelivery(snTxHash: string): Promise<boolean> {
    const hyperlane = this.hyperlane;
    const multiProvider = this.multiProtocolProvider;
    const solanaChain = this.solanaChainName;
    const solanaMailbox = this.solanaMailbox;

    try {
      const receipt =
        await this.starknetProvider.getTransactionReceipt(snTxHash);

      if (!receipt.isSuccess()) {
        return false;
      }

      const event = receipt.events.find((e) =>
        e.keys.includes(this.dispatchIdEventKey)
      );
      if (!event) return false;

      if (event.data.length < 2) return false;
      const data = { low: event.data[0]!, high: event.data[1]! };
      const messageId = num.toHex(uint256.uint256ToBN(data));

      const solanaAdapter = new hyperlane.sdk.SealevelCoreAdapter(
        solanaChain,
        multiProvider,
        { mailbox: solanaMailbox }
      );

      try {
        return await solanaAdapter.waitForMessageProcessed(
          messageId,
          solanaChain,
          0,
          1
        );
      } catch (e) {
        this.logger.debug(
          "[SolanaHyperlaneMonitor] waitForMessageProcessed failed:",
          e
        );
        return false;
      }
    } catch (e) {
      this.logger.debug(
        "[SolanaHyperlaneMonitor] checkSolanaDelivery failed:",
        e
      );
      return false;
    }
  }

  private async getSolanaTxStatus(
    signature: string
  ): Promise<BridgeTransferStatus> {
    try {
      const response = await this.solanaConnection.getSignatureStatus(
        signature,
        { searchTransactionHistory: true }
      );
      const sigStatus = response?.value;

      if (!sigStatus) {
        return BridgeTransferStatus.NOT_SUBMITTED_ON_L1;
      }
      if (sigStatus.err) {
        return BridgeTransferStatus.ERROR;
      }

      const { confirmationStatus } = sigStatus;
      if (
        confirmationStatus === "confirmed" ||
        confirmationStatus === "finalized"
      ) {
        return BridgeTransferStatus.CONFIRMED_ON_L1;
      }

      return BridgeTransferStatus.SUBMITTED_ON_L1;
    } catch {
      return BridgeTransferStatus.NOT_SUBMITTED_ON_L1;
    }
  }
}
