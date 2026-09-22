import { num, uint256, type RpcProvider } from "starknet";
import type { Provider, TransactionReceipt } from "ethers";
import { BridgeTransferStatus } from "@/bridge/monitor/types";
import { type StarkZapLogger, NOOP_LOGGER } from "@/logger";

/**
 * Checks the current status of a Starknet transaction.
 *
 * Returns one of:
 * - `NOT_SUBMITTED_ON_STARKNET` – hash not found or response error.
 * - `ERROR` – transaction was reverted.
 * - `SUBMITTED_ON_STARKNET` – transaction received but not yet accepted on L2.
 * - `CONFIRMED_ON_STARKNET` – accepted on L2 (soft finality).
 * - `COMPLETED_ON_STARKNET` – accepted on L1 (highest finality).
 */
export async function checkStarknetTxStatus(
  txHash: string,
  provider: RpcProvider,
  logger: StarkZapLogger = NOOP_LOGGER
): Promise<BridgeTransferStatus> {
  let receipt: Awaited<ReturnType<RpcProvider["getTransactionReceipt"]>>;

  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (e) {
    logger.debug(`SN TX: [${txHash}]`, e);
    return BridgeTransferStatus.NOT_SUBMITTED_ON_STARKNET;
  }

  if (receipt.isError()) {
    logger.debug(`SN TX: [${txHash}]`, receipt.value);
    return BridgeTransferStatus.ERROR;
  }

  if (receipt.isReverted()) {
    logger.error(`SN TX: [${txHash}] Reverted`);
    return BridgeTransferStatus.ERROR;
  }

  // Successful receipt — check finality
  const finality = receipt.value.finality_status;

  if (finality === "ACCEPTED_ON_L1") {
    return BridgeTransferStatus.COMPLETED_ON_STARKNET;
  }

  if (finality === "ACCEPTED_ON_L2") {
    return BridgeTransferStatus.CONFIRMED_ON_STARKNET;
  }

  // PRE_CONFIRMED / RECEIVED — pending
  return BridgeTransferStatus.SUBMITTED_ON_STARKNET;
}

/**
 * Fetches an Ethereum transaction receipt and returns the corresponding status.
 *
 * Returns:
 * - `NOT_SUBMITTED_ON_L1` – tx not found anywhere.
 * - `SUBMITTED_ON_L1` – tx in mempool but not yet mined.
 * - `ERROR` – mined with failure status.
 * - `CONFIRMED_ON_L1` – mined successfully.
 */
export async function getEthereumTxStatus(
  txHash: string,
  provider: Provider
): Promise<{
  status: BridgeTransferStatus;
  receipt: TransactionReceipt | null;
}> {
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return {
        status: BridgeTransferStatus.NOT_SUBMITTED_ON_L1,
        receipt: null,
      };
    }
    return { status: BridgeTransferStatus.SUBMITTED_ON_L1, receipt: null };
  }

  if (receipt.status === 0) {
    return { status: BridgeTransferStatus.ERROR, receipt };
  }

  return { status: BridgeTransferStatus.CONFIRMED_ON_L1, receipt };
}

/**
 * Read the Hyperlane message id from a receipt's `DispatchId` event.
 *
 * Only an event emitted by the mailbox counts. Any contract can emit an event
 * with the same key, so a transaction could carry a forged `DispatchId` naming
 * a message that was already delivered, and a monitor that read it would report
 * the transfer as complete. Addresses are compared by value, since the RPC and
 * the registry do not pad them the same way.
 *
 * @returns The message id as hex, or `null` when the mailbox emitted none
 */
export function findMailboxMessageId(
  events: ReadonlyArray<{
    from_address: string;
    keys: string[];
    data: string[];
  }>,
  mailbox: string,
  dispatchIdKey: string
): string | null {
  const mailboxFelt = num.toBigInt(mailbox);
  const event = events.find(
    (e) =>
      num.toBigInt(e.from_address) === mailboxFelt &&
      e.keys.includes(dispatchIdKey)
  );
  if (!event || event.data.length < 2) return null;
  return num.toHex(
    uint256.uint256ToBN({ low: event.data[0]!, high: event.data[1]! })
  );
}
