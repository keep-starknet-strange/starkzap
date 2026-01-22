import {
  RpcProvider,
  TransactionExecutionStatus,
  TransactionFinalityStatus,
} from "starknet";
import type {
  TxReceipt,
  TxUnsubscribe,
  TxWatchCallback,
  WaitOptions,
} from "../types/tx.js";
import type { ExplorerConfig } from "../types/config.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * Represents a submitted Starknet transaction.
 * Provides methods to wait for confirmation, watch status changes, and get receipts.
 *
 * @example
 * ```ts
 * const tx = await wallet.execute(calls);
 * console.log(tx.explorerUrl);
 *
 * // Wait for L2 acceptance
 * await tx.wait({
 *   successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
 * });
 *
 * const receipt = await tx.receipt();
 * ```
 */
export class Tx {
  /** Transaction hash */
  readonly hash: string;
  /** URL to view transaction on block explorer */
  readonly explorerUrl: string;

  private readonly provider: RpcProvider;
  private cachedReceipt: TxReceipt | null = null;

  constructor(
    hash: string,
    provider: RpcProvider,
    explorerConfig?: ExplorerConfig
  ) {
    this.hash = hash;
    this.provider = provider;
    this.explorerUrl = buildExplorerUrl(hash, provider, explorerConfig);
  }

  /**
   * Wait for the transaction to reach a target status.
   * Wraps starknet.js `waitForTransaction`.
   *
   * @example
   * ```ts
   * // Wait for L2 (default behavior)
   * await tx.wait();
   *
   * // Wait for L1 finality
   * await tx.wait({
   *   successStates: [TransactionFinalityStatus.ACCEPTED_ON_L1],
   * });
   * ```
   *
   * @throws Error if transaction is reverted
   */
  async wait(options?: WaitOptions): Promise<void> {
    await this.provider.waitForTransaction(this.hash, {
      successStates: [
        TransactionFinalityStatus.ACCEPTED_ON_L2,
        TransactionFinalityStatus.ACCEPTED_ON_L1,
      ],
      errorStates: [TransactionExecutionStatus.REVERTED],
      retryInterval: DEFAULT_POLL_INTERVAL_MS,
      ...options,
    });
  }

  /**
   * Watch transaction status changes.
   * Polls the transaction status and calls the callback on each change.
   *
   * @returns Unsubscribe function to stop watching
   */
  watch(callback: TxWatchCallback): TxUnsubscribe {
    let stopped = false;
    let lastFinality: string | null = null;

    const poll = async () => {
      while (!stopped) {
        try {
          const result = await this.provider.getTransactionStatus(this.hash);
          const finality = result.finality_status;
          const execution = result.execution_status;

          if (finality && finality !== lastFinality) {
            lastFinality = finality;
            callback({ finality, execution });
          }

          if (isFinalStatus(finality, execution)) {
            stopped = true;
            return;
          }
        } catch {
          // Ignore polling errors, retry
        }

        await sleep(DEFAULT_POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      stopped = true;
    };
  }

  /**
   * Get the full transaction receipt.
   * Result is cached after first successful fetch.
   */
  async receipt(): Promise<TxReceipt> {
    if (this.cachedReceipt) {
      return this.cachedReceipt;
    }

    const receipt = await this.provider.getTransactionReceipt(this.hash);
    this.cachedReceipt = receipt;
    return receipt;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildExplorerUrl(
  hash: string,
  provider: RpcProvider,
  config?: ExplorerConfig
): string {
  if (config?.baseUrl) {
    return `${config.baseUrl}/tx/${hash}`;
  }

  const isMainnet = provider.channel.nodeUrl.includes("mainnet");
  const explorerProvider = config?.provider ?? "voyager";

  if (explorerProvider === "starkscan") {
    const subdomain = isMainnet ? "" : "sepolia.";
    return `https://${subdomain}starkscan.co/tx/${hash}`;
  }

  // Default: voyager
  const subdomain = isMainnet ? "" : "sepolia.";
  return `https://${subdomain}voyager.online/tx/${hash}`;
}

function isFinalStatus(finality: string, execution?: string): boolean {
  if (execution === "REVERTED") {
    return true;
  }
  return finality === "ACCEPTED_ON_L2" || finality === "ACCEPTED_ON_L1";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
