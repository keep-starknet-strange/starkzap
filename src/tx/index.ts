import {
  RpcProvider,
  TransactionExecutionStatus,
  TransactionFinalityStatus,
} from "starknet";
import type {
  TxReceipt,
  TxUnsubscribe,
  TxWatchCallback,
  TxWatchOptions,
  WaitOptions,
  ExplorerConfig,
} from "@/types";
import { ChainId } from "@/types";
import { assertSafeHttpUrl } from "@/utils";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_WATCH_TIMEOUT_MS = 10 * 60_000;

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
   * @param options - Poll interval, timeout and error callback. See
   *   {@link TxWatchOptions}. Polling errors and the timeout go to
   *   `options.onError`; a throw from that callback is logged and does not stop
   *   the watch
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
  watch(
    callback: TxWatchCallback,
    options: TxWatchOptions = {}
  ): TxUnsubscribe {
    let stopped = false;
    let lastFinality: string | null = null;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS;
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new Error("tx.watch pollIntervalMs must be a positive number");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new Error("tx.watch timeoutMs must be >= 0");
    }
    const startedAt = Date.now();

    // `poll()` runs detached, so a throw from the caller's `onError` would
    // surface as an unhandled rejection and, in Node, take the process down.
    // Reported on the console because the watch has no logger and the error is
    // the caller's own; the poll itself carries on.
    const reportError = (error: Error) => {
      try {
        options.onError?.(error);
      } catch (thrown) {
        console.error("[starkzap] tx.watch onError callback threw:", thrown);
      }
    };

    const poll = async () => {
      while (!stopped) {
        if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) {
          reportError(
            new Error(
              `Transaction watch timed out after ${timeoutMs}ms for ${this.hash}`
            )
          );
          stopped = true;
          return;
        }

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
        } catch (error) {
          reportError(
            error instanceof Error
              ? error
              : new Error("Failed to poll transaction status")
          );
        }

        await sleep(pollIntervalMs);
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
    if (isFinalReceipt(receipt)) {
      this.cachedReceipt = receipt;
    }
    return receipt;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildExplorerUrl(
  hash: string,
  chainId: ChainId,
  config?: ExplorerConfig
): string {
  const encodedHash = encodeURIComponent(hash);

  if (config && "baseUrl" in config && config.baseUrl) {
    // A link the app renders, never a channel the SDK sends over, so plain
    // http is a display choice rather than a data exposure. Other schemes are
    // still refused.
    const baseUrl = assertSafeHttpUrl(config.baseUrl, "explorer.baseUrl", {
      allowInsecureHttp: true,
    });
    const normalizedBaseUrl = new URL(baseUrl.toString());
    if (!normalizedBaseUrl.pathname.endsWith("/")) {
      normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
    }
    return new URL(`tx/${encodedHash}`, normalizedBaseUrl).toString();
  }

  const isMainnet = chainId.isMainnet();
  const explorerProvider =
    config && "provider" in config ? config.provider : "voyager";

  if (explorerProvider === "starkscan") {
    const subdomain = isMainnet ? "" : "sepolia.";
    return `https://${subdomain}starkscan.co/tx/${encodedHash}`;
  }

  // Default: voyager
  const subdomain = isMainnet ? "" : "sepolia.";
  return `https://${subdomain}voyager.online/tx/${encodedHash}`;
}

function isFinalStatus(finality?: string, execution?: string): boolean {
  if (execution === TransactionExecutionStatus.REVERTED) {
    return true;
  }
  return (
    finality === TransactionFinalityStatus.ACCEPTED_ON_L2 ||
    finality === TransactionFinalityStatus.ACCEPTED_ON_L1
  );
}

function isFinalReceipt(receipt: TxReceipt): boolean {
  const value = receipt as {
    finality_status?: string;
    execution_status?: string;
  };
  return isFinalStatus(value.finality_status, value.execution_status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { TxBuilder } from "@/tx/builder";
