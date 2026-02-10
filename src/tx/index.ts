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
  ExplorerConfig,
} from "@/types";
import { ChainId } from "@/types";

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
    chainId: ChainId,
    explorerConfig?: ExplorerConfig
  ) {
    this.hash = hash;
    this.provider = provider;
    this.explorerUrl = buildExplorerUrl(hash, chainId, explorerConfig);
  }

  /**
   * Wait for the transaction to reach a target status.
   * Wraps starknet.js `waitForTransaction`.
   *
   * @param options - Optional overrides for success/error states and retry interval
   * @throws Error if transaction is reverted or reaches an error state
   *
   * @example
   * ```ts
   * // Wait for L2 acceptance (default)
   * await tx.wait();
   *
   * // Wait for L1 finality
   * await tx.wait({
   *   successStates: [TransactionFinalityStatus.ACCEPTED_ON_L1],
   * });
   * ```
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
   * Watch transaction status changes in real-time.
   *
   * Polls the transaction status and calls the callback whenever the
   * finality status changes. Automatically stops when the transaction
   * reaches a final state (accepted or reverted).
   *
   * @param callback - Called on each status change with `{ finality, execution }`
   * @returns Unsubscribe function — call it to stop watching early
   *
   * @example
   * ```ts
   * const unsubscribe = tx.watch(({ finality, execution }) => {
   *   console.log(`Status: ${finality} (${execution})`);
   * });
   *
   * // Stop watching early if needed
   * unsubscribe();
   * ```
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
   *
   * The result is cached after the first successful fetch, so subsequent
   * calls return immediately without an RPC round-trip.
   *
   * @returns The transaction receipt
   *
   * @example
   * ```ts
   * await tx.wait();
   * const receipt = await tx.receipt();
   * console.log("Fee paid:", receipt.actual_fee);
   * ```
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
  chainId: ChainId,
  config?: ExplorerConfig
): string {
  if (config?.baseUrl) {
    return `${config.baseUrl}/tx/${hash}`;
  }

  const isMainnet = chainId.isMainnet();
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
  if (execution === TransactionExecutionStatus.REVERTED) {
    return true;
  }
  return (
    finality === TransactionFinalityStatus.ACCEPTED_ON_L2 ||
    finality === TransactionFinalityStatus.ACCEPTED_ON_L1
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { TxBuilder } from "@/tx/builder";
