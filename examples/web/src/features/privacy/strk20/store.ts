import { writable, derived, get } from "svelte/store";
import {
  Amount,
  PROOF_BASE_BLOCK_DEPTH,
  fromAddress,
  screeningVerdict,
  type Token,
  type Wallet,
  type WalletInterface,
} from "starkzap";
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
 * Prove and submit one privacy transaction.
 *
 * `compile` receives the proving block and returns the SDK's execute result.
 * The proof travels as transaction-level fields, so it can never be batched
 * with other calls.
 */
async function submit(
  label: string,
  compile: (
    transfers: PrivateTransfersInterface,
    provingBlockId: number
  ) => Promise<{ callAndProof: { call: never; proof: never } }>
): Promise<void> {
  const transfers = get(client);
  const { wallet } = get(walletState);
  if (!transfers || !wallet || get(waiting)) return;

  busy.set(true);
  error.set(null);
  try {
    const provingBlockId =
      (await wallet.getProvider().getBlockNumber()) - PROOF_BASE_BLOCK_DEPTH;

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
  return submit(
    "Register",
    (transfers, provingBlockId) =>
      transfers.build({ provingBlockId }).register().execute() as never
  );
}

/**
 * Deposit into the pool.
 *
 * Two transactions: the ERC20 approve is transparent and cannot share the
 * privacy transaction, because the proof owns that one. The approve must also
 * age before the proof reads the balance, which is why the wait is visible.
 */
export async function deposit(token: Token, input: string): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet || !PRIVACY_CONFIG || !input.trim() || get(waiting)) return;

  const amount = Amount.parse(input, token);
  busy.set(true);
  error.set(null);
  try {
    step.set("Deposit: approving…");
    const approve = await wallet
      .tx()
      .approve(token, fromAddress(PRIVACY_CONFIG.poolContractAddress), amount)
      .send();
    await approve.wait();
    await markSubmitted(approve.hash);
  } catch (err) {
    error.set(describe(err));
    step.set(null);
    busy.set(false);
    return;
  }
  step.set(null);
  busy.set(false);

  // The approve now has to age. The UI shows the countdown; the caller presses
  // "Deposit" again once it clears.
  pendingDeposit.set({ token, input });
}

/** A deposit whose approve has landed and is waiting to become provable. */
export const pendingDeposit = writable<{
  token: Token;
  input: string;
} | null>(null);

export function finishDeposit(): Promise<void> {
  const pending = get(pendingDeposit);
  if (!pending) return Promise.resolve();
  const { token, input } = pending;
  const amount = Amount.parse(input, token);
  const { wallet } = get(walletState);

  return submit(
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
        .surplusTo(wallet!.address)
        .execute() as never
  ).then(() => pendingDeposit.set(null));
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
