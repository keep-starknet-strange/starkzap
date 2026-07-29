import { RpcError, num, uint256, type RpcProvider } from "starknet";
import type { Address, Token } from "@/types";

/**
 * Blocks a proof's base block must trail the chain head by before the
 * sequencer will accept the proof.
 *
 * Matches the privacy pool's acceptance window. The prover also reads
 * finalized state, so waiting this long covers both constraints at once.
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
   * Called once per poll, including the one that succeeds. Use it to surface
   * how long a wait actually blocked — these waits are invisible otherwise,
   * and "it hung" is indistinguishable from "it was waiting for a block".
   */
  onAttempt?: (attempt: ProvableAttempt) => void;
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

  let attempt = 0;
  for (;;) {
    const latest = await provider.getBlockNumber();
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
    await sleep(pollIntervalMs);
  }
}

/**
 * Wait until the state a proof depends on is visible at the proving block, and
 * return that block number.
 *
 * Use this instead of {@link waitForProvableBlock} when the state was written
 * by something you never saw a receipt for — an account funded from a faucet,
 * a bridge, or another wallet. Checking the state directly covers those cases;
 * counting blocks from a receipt cannot.
 *
 * @param provider - RPC provider used to read the chain head and the state
 * @param isVisible - Predicate run against a candidate proving block
 * @param options - Depth, poll interval and timeout overrides
 * @returns The block number to pass as the proving block
 * @throws If the state is not visible within `timeoutMs`
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
    await sleep(pollIntervalMs);
  }
}

/**
 * Wait until the account is deployed as of the proving block.
 *
 * `register()` proves against the account's on-chain viewing-key slot, which
 * does not exist until the deploy is finalized — so registering right after
 * deploying produces a proof over a slot that isn't there yet.
 *
 * @param provider - RPC provider used to read the chain head and class hash
 * @param address - Account whose deployment must be visible
 * @param options - Depth, poll interval and timeout overrides
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
        // Not deployed *yet* at this block — keep waiting. Any other failure is
        // a real error and must not be mistaken for "not deployed", or this
        // would poll until the timeout against a broken endpoint.
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
 * Wait until `owner` is known to hold at least `amount` of `token` as of the
 * proving block.
 *
 * A deposit proves against the depositor's token balance at its base block. If
 * the transfer that funded the account hasn't propagated that far back, the
 * proof is invalid or the deposit reverts on-chain for insufficient balance.
 *
 * Note this is about the *balance*, not the ERC20 allowance: the approve a
 * deposit needs is checked when the transaction executes, not when it is
 * proven, so it does not have to age.
 *
 * @param provider - RPC provider used to read the chain head and balance
 * @param token - Token being deposited
 * @param owner - Address whose balance must be visible
 * @param amount - Minimum balance required, in base units
 * @param options - Depth, poll interval and timeout overrides
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
