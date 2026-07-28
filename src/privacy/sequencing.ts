import type { RpcProvider } from "starknet";

/**
 * Blocks a proof's base block must trail the chain head by before the
 * sequencer will accept the proof.
 *
 * Matches the privacy pool's acceptance window. The prover also reads
 * finalized state, so waiting this long covers both constraints at once.
 */
export const PROOF_BASE_BLOCK_DEPTH = 10;

/** Options for {@link waitForProvableBlock}. */
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
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until a block is old enough to prove against, and return the block
 * number to prove at.
 *
 * Any on-chain state a pool proof reads — the account's viewing key, the
 * depositor's token balance, the nullifier set — must have been written at
 * least {@link PROOF_BASE_BLOCK_DEPTH} blocks before the proof's base block.
 * That makes this a prerequisite, not a nicety, after:
 *
 * - a previous private transaction, before proving the next one;
 * - deploying the account, before `register()`;
 * - funding the account, before `deposit()`.
 *
 * Skipping the wait produces a proof the sequencer rejects, or one that reads
 * a balance the chain doesn't have yet — both surface as opaque failures well
 * after the call that actually caused them.
 *
 * @param provider - RPC provider used to read the chain head
 * @param sinceBlock - Receipt block of the state the next proof must see
 * @param options - Depth, poll interval and timeout overrides
 * @returns The block number to pass as the proving block
 * @throws If the chain head does not advance far enough within `timeoutMs`
 *
 * @example
 * ```ts
 * const receipt = await tx.wait();
 * const provingBlock = await waitForProvableBlock(provider, receipt.block_number);
 *
 * const { callAndProof } = await transfers
 *   .build({ provingBlockId: { block_number: provingBlock } })
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

  let latest = await provider.getBlockNumber();
  while (sinceBlock >= latest - depth) {
    if (Date.now() >= deadline) {
      throw new Error(
        `[starkzap] Timed out after ${timeoutMs}ms waiting for block ${sinceBlock} to be ${depth} blocks behind the chain head (head is ${latest}).`
      );
    }
    await sleep(pollIntervalMs);
    latest = await provider.getBlockNumber();
  }

  return latest - depth;
}
