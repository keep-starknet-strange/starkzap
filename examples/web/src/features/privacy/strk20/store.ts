import { writable, derived, get } from "svelte/store";
import {
  Amount,
  fromAddress,
  screeningVerdict,
  waitForFundedBalance,
  type PrivacyClient,
  type PrivacyFeeQuote,
  type PrivacySendOptions,
  type ProvableAttempt,
  type Token,
  type Wallet,
  type WalletInterface,
} from "starkzap";
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

export const client = writable<PrivacyClient | null>(null);
export const connecting = writable(false);
export const busy = writable(false);
/** Human-readable stage of a multi-step operation, shown while `busy`. */
export const step = writable<string | null>(null);
export const error = writable<string | null>(null);
export const registered = writable<boolean | null>(null);
export const balances = writable<PrivacyBalance[]>([]);

// ─── Visible block wait ──────────────────────────────────────────────────────
//
// A proof must read pool state that already includes our last private
// transaction, so `send()` waits for it to age before proving. The client owns
// that wait now; this just surfaces it, because ten blocks is seconds on Sepolia
// and minutes on mainnet — long enough that a silent spinner looks like a hang.

/** Blocks still to wait, or null when nothing is waiting. */
export const waitingBlocks = writable<number | null>(null);

/** Pool fee the paymaster last quoted, shown before the user commits. */
export const fee = writable<PrivacyFeeQuote | null>(null);

/**
 * The quoted fee as something a person can read.
 *
 * `feeAction` gives base units and a token address, which is the whole cost to
 * the user but unreadable as-is. The pool fee does not depend on what the
 * transaction does — the paymaster quotes it per pool, not per action — so this
 * one figure covers every send.
 */
export const feeLabel = derived([fee, tokens], ([$fee, $tokens]) => {
  if (!$fee) return null;
  const { amount, token: address } = $fee.feeAction;
  if (amount === 0n) return "No pool fee on this deployment.";

  const token = $tokens.find((t) => BigInt(t.address) === BigInt(address));
  // A fee token that is not in the list still has to render: base units name
  // the cost badly, but silence names it not at all.
  return token
    ? Amount.fromRaw(amount, token).toFormatted(true)
    : `${amount} base units of ${address}`;
});

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
  client.set(null);
  registered.set(null);
  balances.set([]);
  waitingBlocks.set(null);
  fee.set(null);
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
    const privacy = await wallet.privacy();
    client.set(privacy);
    // Surfaced before the first send: the pool fee is a separate withdrawal the
    // paymaster requires, and `simulate` knows nothing about it.
    fee.set(await privacy.quote());
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
  } catch (err) {
    error.set(describe(err));
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Log every poll of a block wait, and mirror it into `waitingBlocks`.
 *
 * The wait is otherwise invisible: a deposit that blocks for eight blocks looks
 * identical to one that hung. Logging each attempt also makes it checkable which
 * proving block a proof actually used.
 */
function logAttempts(what: string): (attempt: ProvableAttempt) => void {
  return ({ attempt, head, provingBlock, ready }) => {
    waitingBlocks.set(ready ? null : Math.max(1, provingBlock + 1 - head + 10));
    log(
      `wait[${what}] #${attempt}: head ${head}, proving block ${provingBlock} — ${
        ready ? "ready" : "not provable yet, polling"
      }`,
      ready ? "success" : "info"
    );
  };
}

/**
 * Run one privacy operation through the client.
 *
 * `send()` owns the fee, the proving block and submission, so all this adds is
 * UI state: the busy flag, the step label, and error translation.
 */
async function run(
  label: string,
  compose: Parameters<PrivacyClient["send"]>[0],
  options?: PrivacySendOptions
): Promise<void> {
  const privacy = get(client);
  if (!privacy) return;

  busy.set(true);
  error.set(null);
  try {
    step.set(`${label}: proving and submitting…`);
    const hash = await privacy.send(compose, {
      onWait: logAttempts(label),
      ...options,
    });
    log(`${label} submitted by the paymaster's relayer: ${hash}`, "success");

    step.set(`${label}: refreshing…`);
    fee.set(await privacy.quote());
    await refresh();
  } catch (err) {
    error.set(describe(err));
  } finally {
    waitingBlocks.set(null);
    step.set(null);
    busy.set(false);
  }
}

/**
 * Deposit into the pool.
 *
 * Two transactions: the ERC20 approve is transparent and cannot share the
 * privacy transaction, because the proof owns that one. The approve does not
 * have to age — it is checked when the deposit executes, not when it is proven
 * — so the deposit follows straight after it. What must be visible at the
 * proving block is the *balance*, which `waitForFundedBalance` checks directly,
 * covering funds that arrived from a faucet or another wallet.
 *
 * This is also where registration happens: `autoRegister` folds it in, and a
 * standalone register could not pay the pool fee from an empty balance.
 */
export async function deposit(token: Token, input: string): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet || !PRIVACY_CONFIG || !input.trim()) return;

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
    log(`approve ${approve.hash} landed`, "info");
  } catch (err) {
    error.set(describe(err));
    step.set(null);
    busy.set(false);
    return;
  }
  busy.set(false);

  const provider = wallet.getProvider();
  await run(
    "Deposit",
    (b) =>
      b
        .with(token.address, (t) => t.deposit({ amount: amount.toBase() }))
        .surplusTo(wallet.address),
    {
      autoRegister: true,
      autoSetup: true,
      autoDiscover: { notes: "refresh", channels: "refresh" },
      // Overrides the client's own sequencing: this proof reads the depositor's
      // ERC20 balance, which the client has no way to know about.
      provingBlockId: await waitForFundedBalance(
        provider,
        token,
        fromAddress(wallet.address),
        amount.toBase(),
        { onAttempt: logAttempts("Deposit · balance visible") }
      ),
    }
  );
}

export function transfer(
  token: Token,
  recipient: string,
  input: string
): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet) return Promise.resolve();
  const amount = Amount.parse(input, token);

  return run(
    "Transfer",
    (b) =>
      b
        .with(token.address, (t) =>
          t.transfer({ recipient: recipient.trim(), amount: amount.toBase() })
        )
        .surplusTo(wallet.address),
    {
      autoSetup: true,
      autoSelectNotes: "naive",
      autoDiscover: { notes: "refresh", channels: "refresh" },
    }
  );
}

/**
 * Withdraw to a public address.
 *
 * The recipient is explicit rather than defaulting to this wallet: a deposit and
 * a withdrawal are both public, so sending funds back to the address they came
 * from puts the pool's two ends on one address and links them. Withdrawing to
 * yourself is legitimate — it just has to be a choice, not a default.
 */
export function withdraw(
  token: Token,
  recipient: string,
  input: string
): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet || !recipient.trim()) return Promise.resolve();
  const amount = Amount.parse(input, token);

  return run(
    "Withdraw",
    (b) =>
      b
        .with(token.address, (t) =>
          t.withdraw({ recipient: recipient.trim(), amount: amount.toBase() })
        )
        // Surplus is a *private* note, so it stays in the pool with us.
        .surplusTo(wallet.address),
    {
      autoSelectNotes: "naive",
      autoDiscover: { notes: "refresh", channels: "refresh" },
    }
  );
}

/**
 * Whether a recipient can receive a private transfer yet.
 *
 * The SDK cannot build a transfer to an account with no viewing key on-chain,
 * so the UI checks before offering the action.
 */
export async function recipientReady(
  recipient: string,
  token: Token
): Promise<boolean> {
  const privacy = get(client);
  if (!privacy || !recipient.trim()) return false;
  try {
    const requirement = await privacy.discoverRequirement(
      recipient.trim(),
      token.address
    );
    return requirement !== 0; // SetupRequirement.Register === 0
  } catch {
    return false;
  }
}

/** Turn screening and paymaster rejections into something a user can act on. */
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
