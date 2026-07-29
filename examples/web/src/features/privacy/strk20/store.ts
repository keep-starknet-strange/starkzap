import { writable, derived, get } from "svelte/store";
import {
  Amount,
  PROOF_BASE_BLOCK_DEPTH,
  fromAddress,
  screeningVerdict,
  waitForDeployedAccount,
  waitForFundedBalance,
  type ProvableAttempt,
  type Token,
  type Wallet,
  type WalletInterface,
} from "starkzap";
import type { RpcProvider } from "starknet";
import type { PrivateTransfersInterface } from "@starkware-libs/starknet-privacy-sdk";
import { PRIVACY_CONFIG } from "~/lib/stores/config";
import { tokens } from "~/lib/stores/tokens";
import { walletState } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";

/** Private + transparent balance for one token. */
export interface PrivacyBalance {
  token: Token;
  private: Amount;
  notes: number;
}

export const client = writable<PrivateTransfersInterface | null>(null);
export const connecting = writable(false);
export const busy = writable(false);
/** Human-readable stage of a multi-step operation, shown while `busy`. */
export const step = writable<string | null>(null);
export const error = writable<string | null>(null);
export const registered = writable<boolean | null>(null);
export const balances = writable<PrivacyBalance[]>([]);

// ─── Visible 10-block wait ───────────────────────────────────────────────────
//
// Any on-chain state a proof reads must trail the chain head by
// PROOF_BASE_BLOCK_DEPTH blocks. Rather than hide that inside a spinner, the
// block of our last transaction and the current head are both state, so the UI
// can show a countdown and disable actions until it clears.

/** Block of the last transaction whose effects the next proof must see. */
export const lastTxBlock = writable<number | null>(null);
export const head = writable<number | null>(null);

export const blocksUntilProvable = derived(
  [lastTxBlock, head],
  ([$last, $head]) => {
    if ($last === null || $head === null) return 0;
    return Math.max(0, PROOF_BASE_BLOCK_DEPTH - ($head - $last) + 1);
  }
);

export const waiting = derived(blocksUntilProvable, (n) => n > 0);

let poller: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (poller) {
    clearInterval(poller);
    poller = null;
  }
}

/** Poll the chain head until the pending wait clears, then stop. */
function startPolling() {
  stopPolling();
  const tick = async () => {
    const { wallet } = get(walletState);
    if (!wallet) return stopPolling();
    head.set(await wallet.getProvider().getBlockNumber());
    if (get(blocksUntilProvable) === 0) stopPolling();
  };
  void tick();
  poller = setInterval(() => void tick(), 5_000);
}

/** Record the block a transaction landed in and begin the countdown. */
async function markSubmitted(txHash: string): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  lastTxBlock.set(await wallet.getProvider().getBlockNumber());
  startPolling();
  log(`privacy tx ${txHash}`, "info");
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Narrow to a locally-signed wallet.
 *
 * `privacy()` is defined on `Wallet` but not on `WalletInterface`, because
 * `CartridgeWallet` cannot derive a viewing key. Testing for the method is the
 * runtime mirror of that compile-time gate.
 */
function localWallet(wallet: WalletInterface | null): Wallet | null {
  return wallet && "privacy" in wallet ? (wallet as Wallet) : null;
}

/** Why the STRK20 tab cannot be used, or null when it can. */
export function unavailableReason(walletType: string | null): string | null {
  if (!PRIVACY_CONFIG) {
    return "Set VITE_PRIVACY_POOL_*, VITE_PRIVACY_PROVER_* and VITE_PRIVACY_DISCOVERY_* for this network in .env.";
  }
  if (walletType !== "privatekey") {
    return "The privacy pool needs a private-key login: the viewing key is derived from a deterministic signature, which Privy and Cartridge signers do not provide.";
  }
  return null;
}

export function clear(): void {
  stopPolling();
  client.set(null);
  registered.set(null);
  balances.set([]);
  lastTxBlock.set(null);
  head.set(null);
  error.set(null);
}

/** Create the privacy client from the SDK config and load state. */
export async function connect(): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet) return;
  connecting.set(true);
  error.set(null);
  try {
    // `wallet.privacy()` reads `privacy` from the SDK config and caches the
    // client, so repeated calls are cheap.
    const transfers = await wallet.privacy();
    client.set(transfers);
    await refresh();
  } catch (err) {
    error.set(describe(err));
    client.set(null);
  } finally {
    connecting.set(false);
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Refresh registration state, per-token private balances, and history. */
export async function refresh(): Promise<void> {
  const transfers = get(client);
  const { wallet } = get(walletState);
  if (!transfers || !wallet) return;

  try {
    const list = get(tokens);
    // One discovery call covers every token, so balances are a grouping of it.
    const { notes } = await transfers.discoverNotes();

    balances.set(
      list.map((token) => {
        const owned = notes.get(BigInt(token.address)) ?? [];
        const total = owned.reduce((sum, note) => sum + note.amount, 0n);
        return {
          token,
          private: Amount.fromRaw(total, token),
          notes: owned.length,
        };
      })
    );

    // Registration is per account, not per token, so any token answers it.
    const probe = list[0];
    if (probe) {
      const requirement = await transfers.discoverRequirement(
        wallet.address,
        probe.address
      );
      registered.set(requirement !== 0); // SetupRequirement.Register === 0
    }

    head.set(await wallet.getProvider().getBlockNumber());
  } catch (err) {
    error.set(describe(err));
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Log every poll of a provable-state wait.
 *
 * These waits are otherwise invisible: a deposit that blocks for eight blocks
 * looks identical to one that hung. Logging each attempt also makes it
 * checkable which proving block a proof actually used.
 */
function logAttempts(what: string): (attempt: ProvableAttempt) => void {
  return ({ attempt, head, provingBlock, ready }) =>
    log(
      `wait[${what}] #${attempt}: head ${head}, proving block ${provingBlock} — ${
        ready ? "ready" : "not visible yet, polling"
      }`,
      ready ? "success" : "info"
    );
}

/**
 * Prove and submit one privacy transaction.
 *
 * `compile` receives the proving block and returns the SDK's execute result.
 * The proof travels as transaction-level fields, so it can never be batched
 * with other calls.
 *
 * `provable` lets an operation demand more than the default depth: some proofs
 * read state this app never saw a receipt for (an account funded elsewhere), so
 * they check the state itself rather than counting blocks from a transaction.
 */
async function submit(
  label: string,
  compile: (
    transfers: PrivateTransfersInterface,
    provingBlockId: number
  ) => Promise<{ callAndProof: { call: never; proof: never } }>,
  provable?: (provider: RpcProvider) => Promise<number>
): Promise<void> {
  const transfers = get(client);
  const { wallet } = get(walletState);
  if (!transfers || !wallet) return;
  if (get(waiting)) {
    // The button is disabled while the countdown runs, so reaching this is a
    // bug — but returning silently would look like a dead click.
    log(
      `${label} blocked: ${get(
        blocksUntilProvable
      )} block(s) until our last private tx is provable`,
      "warn"
    );
    return;
  }

  busy.set(true);
  error.set(null);
  try {
    const provider = wallet.getProvider();
    step.set(`${label}: checking state…`);
    let provingBlockId: number;
    if (provable) {
      provingBlockId = await provable(provider);
    } else {
      // No extra state precondition. The only state this proof reads is our own
      // last private tx, which the countdown above already gated on.
      provingBlockId =
        (await provider.getBlockNumber()) - PROOF_BASE_BLOCK_DEPTH;
      log(
        `${label}: no state precondition, proving at ${provingBlockId} (head - ${PROOF_BASE_BLOCK_DEPTH}); countdown already clear`,
        "info"
      );
    }

    step.set(`${label}: proving…`);
    const { callAndProof } = await compile(transfers, provingBlockId);

    step.set(`${label}: submitting…`);
    const tx = await wallet.execute([callAndProof.call], {
      proof: callAndProof.proof,
    });
    await tx.wait();
    await markSubmitted(tx.hash);

    step.set(`${label}: refreshing…`);
    await refresh();
  } catch (err) {
    error.set(describe(err));
  } finally {
    step.set(null);
    busy.set(false);
  }
}

export function register(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return Promise.resolve();

  return submit(
    "Register",
    (transfers, provingBlockId) =>
      transfers.build({ provingBlockId }).register().execute() as never,
    // The proof reads the account's viewing-key slot, which only exists once
    // the deploy is finalized — registering right after deploying would prove
    // over a slot that isn't there yet.
    (provider) =>
      waitForDeployedAccount(provider, fromAddress(wallet.address), {
        onAttempt: logAttempts("Register · account deployed"),
      })
  );
}

/**
 * Deposit into the pool.
 *
 * Two transactions: the ERC20 approve is transparent and cannot share the
 * privacy transaction, because the proof owns that one. The approve does not
 * have to age — it is checked when the deposit executes, not when it is proven
 * — so the deposit follows straight after it. What must be visible at the
 * proving block is the *balance*, which is what `waitForFundedBalance` checks.
 */
export async function deposit(token: Token, input: string): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet || !PRIVACY_CONFIG || !input.trim() || get(waiting)) return;

  const amount = Amount.parse(input, token);
  let approveBlock: number | null = null;
  busy.set(true);
  error.set(null);
  try {
    step.set("Deposit: approving…");
    const approve = await wallet
      .tx()
      .approve(token, fromAddress(PRIVACY_CONFIG.poolContractAddress), amount)
      .send();
    await approve.wait();
    // Logged so the approve's block can be compared with the proving block the
    // deposit then uses: if proving is *earlier*, the allowance did not age.
    const receipt = await wallet
      .getProvider()
      .getTransactionReceipt(approve.hash);
    approveBlock =
      "block_number" in receipt ? (receipt.block_number as number) : null;
    log(`approve ${approve.hash} landed in block ${approveBlock}`, "info");
  } catch (err) {
    error.set(describe(err));
    step.set(null);
    busy.set(false);
    return;
  }
  busy.set(false);

  await submit(
    "Deposit",
    (transfers, provingBlockId) =>
      transfers
        .build({
          autoRegister: true,
          autoSetup: true,
          autoDiscover: { notes: "refresh", channels: "refresh" },
          provingBlockId,
        })
        .with(token.address)
        .deposit({ amount: amount.toBase() })
        .surplusTo(wallet.address)
        .execute() as never,
    (provider) =>
      waitForFundedBalance(
        provider,
        token,
        fromAddress(wallet.address),
        amount.toBase(),
        {
          onAttempt: (attempt) => {
            logAttempts("Deposit · balance visible")(attempt);
            if (attempt.ready && approveBlock !== null) {
              log(
                `proving at ${attempt.provingBlock}, approve was block ${approveBlock} — ` +
                  (attempt.provingBlock < approveBlock
                    ? "proving block predates the approve, so the allowance did not have to age"
                    : "proving block is at or after the approve, so this run does not test the allowance claim"),
                "info"
              );
            }
          },
        }
      )
  );
}

export function transfer(
  token: Token,
  recipient: string,
  input: string
): Promise<void> {
  const amount = Amount.parse(input, token);
  const { wallet } = get(walletState);

  return submit(
    "Transfer",
    (transfers, provingBlockId) =>
      transfers
        .build({
          autoSetup: true,
          autoSelectNotes: "naive",
          autoDiscover: { notes: "refresh", channels: "refresh" },
          provingBlockId,
        })
        .with(token.address)
        .transfer({ recipient: recipient.trim(), amount: amount.toBase() })
        .surplusTo(wallet!.address)
        .execute() as never
  );
}

export function withdraw(token: Token, input: string): Promise<void> {
  const amount = Amount.parse(input, token);
  const { wallet } = get(walletState);

  return submit(
    "Withdraw",
    (transfers, provingBlockId) =>
      transfers
        .build({
          autoSelectNotes: "naive",
          autoDiscover: { notes: "refresh", channels: "refresh" },
          provingBlockId,
        })
        .with(token.address)
        .withdraw({ recipient: wallet!.address, amount: amount.toBase() })
        .surplusTo(wallet!.address)
        .execute() as never
  );
}

/**
 * Whether a recipient can receive a private transfer yet. The SDK cannot build
 * a transfer to an account with no viewing key on-chain, so the UI checks
 * before offering the action.
 */
export async function recipientReady(
  recipient: string,
  token: Token
): Promise<boolean> {
  const transfers = get(client);
  if (!transfers || !recipient.trim()) return false;
  try {
    const requirement = await transfers.discoverRequirement(
      recipient.trim(),
      token.address
    );
    return requirement !== 0; // SetupRequirement.Register === 0
  } catch {
    return false;
  }
}

/** Turn screening rejections into something a user can act on. */
function describe(err: unknown): string {
  switch (screeningVerdict(err)) {
    case "rejected":
      return "Screening rejected this deposit. The source address is blocked; retrying will not help.";
    case "unavailable":
      return "Screening is unavailable right now. Deposits fail closed — try again later.";
    default:
      return String(err instanceof Error ? err.message : err);
  }
}
