import { RpcError, num, uint256, type RpcProvider } from "starknet";
import type { Address, Token } from "@/types";

/**
 * How many blocks a proof's base block must trail the chain head.
 *
 * Matches the privacy pool's acceptance window.
 */
export const PROOF_BASE_BLOCK_DEPTH = 10;

/** One poll of a wait, reported to {@link ProvableBlockOptions.onAttempt}. */
export interface ProvableAttempt {
  /** Poll count, starting at 1. */
  attempt: number;
  /** Chain head read on this poll. */
  head: number;
  /** Candidate proving block: `head - depth`. */
  provingBlock: number;
  /** Whether the wait is satisfied, making this the final poll. */
  ready: boolean;
}

/** Options for the wait helpers in this module. */
export interface ProvableBlockOptions {
  /**
   * Blocks the proving block must trail the head by.
   * Default {@link PROOF_BASE_BLOCK_DEPTH}.
   */
  depth?: number;
  /** Delay between chain-head polls, in ms (default 2000). */
  pollIntervalMs?: number;
  /** Give up after this long, in ms (default 300000). */
  timeoutMs?: number;
  /**
   * Called once per poll, including the last one. Use it to show progress.
   * Without it, the wait is silent.
   */
  onAttempt?: (attempt: ProvableAttempt) => void;
  /**
   * Cancels the wait. The promise rejects with the signal's reason.
   *
   * A wait can take minutes. Pass a signal when the user can leave the screen
   * or disconnect.
   *
   * Only the wait is cancelled. A proof already in flight continues.
   */
  signal?: AbortSignal;
}

/**
 * Sleep, or reject as soon as `signal` aborts.
 *
 * The listener is removed on the normal path too, so a long wait does not
 * leak listeners.
 */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal === undefined) {
      setTimeout(resolve, ms);
      return;
    }
    // An already aborted signal fires no event, so check first.
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Wait until a block is old enough to prove against, and return the block
 * number to prove at.
 *
 * The proving block is `depth` blocks behind the chain head, with
 * {@link PROOF_BASE_BLOCK_DEPTH} as the default. State a proof reads must be in
 * a block before the proving block. So call this after:
 *
 * - a previous private transaction, before proving the next one;
 * - deploying the account, before `register()`;
 * - funding the account, before `deposit()`.
 *
 * Without the wait, the sequencer rejects the proof, or the proof reads state
 * the chain does not have yet.
 *
 * @param provider - RPC provider used to read the chain head
 * @param sinceBlock - Receipt block of the state the next proof must see
 * @param options - Depth, poll interval, timeout and abort overrides
 * @returns The block number to pass as the proving block
 * @throws If the chain head does not advance far enough within `timeoutMs`,
 *   or with `options.signal`'s reason if it aborts
 *
 * @example
 * ```ts
 * const receipt = await tx.wait();
 * const provingBlock = await waitForProvableBlock(provider, receipt.block_number);
 *
 * const { callAndProof } = await transfers
 *   .build({ provingBlockId: provingBlock })
 *   .with(STRK, (t) => t.transfer({ recipient: bob, amount: 50n }))
 *   .execute();
 * ```
 */
export async function waitForProvableBlock(
  provider: RpcProvider,
  sinceBlock: number,
  options: ProvableBlockOptions = {}
): Promise<number> {
  const depth = options.depth ?? PROOF_BASE_BLOCK_DEPTH;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 300_000;

  const deadline = Date.now() + timeoutMs;

  let attempt = 0;
  for (;;) {
    options.signal?.throwIfAborted();
    const latest = await provider.getBlockNumber();
    // Strictly below, so the proving block is always past `sinceBlock`. This
    // is the same comparison the privacy SDK uses.
    const ready = sinceBlock < latest - depth;
    options.onAttempt?.({
      attempt: ++attempt,
      head: latest,
      provingBlock: latest - depth,
      ready,
    });
    if (ready) return latest - depth;

    if (Date.now() >= deadline) {
      throw new Error(
        `[starkzap] Timed out after ${timeoutMs}ms waiting for block ${sinceBlock} to be ${depth} blocks behind the chain head (head is ${latest}).`
      );
    }
    await sleep(pollIntervalMs, options.signal);
  }
}

/**
 * Wait until the state a proof depends on is visible at the proving block, and
 * return that block number.
 *
 * Use this instead of {@link waitForProvableBlock} when you have no receipt,
 * because another party sent the transaction.
 *
 * @param provider - RPC provider used to read the chain head and the state
 * @param isVisible - Predicate run against a candidate proving block
 * @param options - Depth, poll interval, timeout and abort overrides
 * @returns The block number to pass as the proving block
 * @throws If the state is not visible within `timeoutMs`, or with
 *   `options.signal`'s reason if it aborts
 */
export async function waitForProvableState(
  provider: RpcProvider,
  isVisible: (blockNumber: number) => Promise<boolean>,
  options: ProvableBlockOptions = {}
): Promise<number> {
  const depth = options.depth ?? PROOF_BASE_BLOCK_DEPTH;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + (options.timeoutMs ?? 300_000);

  let attempt = 0;
  for (;;) {
    options.signal?.throwIfAborted();
    const head = await provider.getBlockNumber();
    const provingBlock = head - depth;
    const ready = provingBlock >= 0 && (await isVisible(provingBlock));
    options.onAttempt?.({ attempt: ++attempt, head, provingBlock, ready });
    if (ready) return provingBlock;

    if (Date.now() >= deadline) {
      throw new Error(
        `[starkzap] Timed out waiting for the state a proof depends on to be visible ${depth} blocks behind the chain head.`
      );
    }
    await sleep(pollIntervalMs, options.signal);
  }
}

/**
 * Wait until the account is deployed as of the proving block.
 *
 * `register()` proves against the account's on-chain state. Call this before
 * registering a freshly deployed account.
 *
 * @param provider - RPC provider used to read the chain head and class hash
 * @param address - Account whose deployment must be visible
 * @param options - Depth, poll interval, timeout and abort overrides
 * @returns The block number to pass as the proving block
 */
export function waitForDeployedAccount(
  provider: RpcProvider,
  address: Address,
  options: ProvableBlockOptions = {}
): Promise<number> {
  return waitForProvableState(
    provider,
    async (blockNumber) => {
      try {
        await provider.getClassHashAt(address, blockNumber);
        return true;
      } catch (error) {
        // Not deployed yet at this block, so keep waiting. Any other error is
        // real and must not be mistaken for "not deployed".
        if (error instanceof RpcError && error.isType("CONTRACT_NOT_FOUND")) {
          return false;
        }
        throw error;
      }
    },
    options
  );
}

/**
 * Wait until `owner` holds at least `amount` of `token` as of the proving
 * block.
 *
 * A deposit proves against the depositor's balance at the base block. Call
 * this after funding the account, before `deposit()`.
 *
 * This is about the balance, not the ERC20 allowance. The approve does not
 * have to age.
 *
 * @param provider - RPC provider used to read the chain head and balance
 * @param token - Token being deposited
 * @param owner - Address whose balance must be visible
 * @param amount - Minimum balance required, in base units
 * @param options - Depth, poll interval, timeout and abort overrides
 * @returns The block number to pass as the proving block
 */
export function waitForFundedBalance(
  provider: RpcProvider,
  token: Token,
  owner: Address,
  amount: bigint,
  options: ProvableBlockOptions = {}
): Promise<number> {
  return waitForProvableState(
    provider,
    async (blockNumber) =>
      (await balanceAt(provider, token, owner, blockNumber)) >= amount,
    options
  );
}

/** Read an ERC20 balance pinned to a block. */
async function balanceAt(
  provider: RpcProvider,
  token: Token,
  owner: Address,
  blockNumber: number
): Promise<bigint> {
  const read = (entrypoint: string): Promise<string[]> =>
    provider.callContract(
      { contractAddress: token.address, entrypoint, calldata: [owner] },
      blockNumber
    );

  let result: string[];
  try {
    result = await read("balance_of");
  } catch (error) {
    // Same camelCase fallback the Erc20 helper uses for older tokens.
    if (error instanceof RpcError && error.isType("ENTRYPOINT_NOT_FOUND")) {
      result = await read("balanceOf");
    } else {
      throw error;
    }
  }

  const [low, high] = result;
  if (low === undefined) return 0n;
  return high === undefined
    ? num.toBigInt(low)
    : uint256.uint256ToBN({ low, high });
}
