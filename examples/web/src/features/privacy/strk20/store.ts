import { writable, derived, get } from "svelte/store";
import {
  Amount,
  fromAddress,
  revokePrivacy,
  screeningVerdict,
  Tx,
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
 * How a deposit's ERC20 `approve` gets on-chain.
 *
 * `"separate"` sends it as its own transaction the user signs and pays for.
 * `"bundled"` hands it to `send({ invoke })`, so the paymaster relays it through
 * the account's `execute_from_outside` in the same transaction as the pool action.
 *
 * A switch rather than a default because the two differ in a way only a live
 * transaction settles: bundling relies on the relayer running the wrapped call
 * *before* the pool action, or the pool's `transferFrom` finds no allowance.
 * Nothing about the request says which order it uses.
 */
export const approveMode = writable<"separate" | "bundled">("separate");

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

/**
 * What the transaction was estimated at, when that differs from what is charged.
 *
 * Only for `default` mode. There the withdrawal is the paymaster's suggested
 * *maximum* gas, so the gap against its own estimate is headroom the user pays
 * for and may not use — worth seeing before committing. Under the sponsored
 * modes the relayer pays the gas and these are its costs, not the user's, so
 * showing them would misattribute the money.
 */
export const gasNote = derived([fee, tokens], ([$fee, $tokens]) => {
  if (PRIVACY_CONFIG?.paymaster?.fee.mode !== "default") return null;

  const gas = $fee?.gas;
  if (!gas || !$fee) return null;

  const token = $tokens.find(
    (t) => BigInt(t.address) === BigInt($fee.feeAction.token)
  );
  if (!token) return null;

  const estimated = Amount.fromRaw(gas.estimatedInGasToken, token);
  return (
    `Estimated at ${estimated.toFormatted(true)} — the figure above is the ` +
    "paymaster's suggested maximum, and the difference is headroom you may not " +
    "use. A sponsored fee mode charges a flat pool fee instead."
  );
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

/**
 * Drop the privacy capability, revoking the viewing key with it.
 *
 * Call this on logout and before every login. The client holds a live viewing
 * key, so releasing the reference alone would leave the key usable by anything
 * still holding one — and this store is module-global, so it outlives the login
 * that created it.
 */
export function clear(): void {
  const current = get(client);
  client.set(null);
  if (current) revokePrivacy(current.transfers);
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
    fail("Connect", err);
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
    fail("Refresh", err);
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
 *
 * @returns Whether the transaction executed. False also means the error store
 *   holds the reason, so a caller can keep the user's input for a retry.
 */
async function run(
  label: string,
  compose: Parameters<PrivacyClient["send"]>[0],
  options?: PrivacySendOptions
): Promise<boolean> {
  const privacy = get(client);
  const wallet = localWallet(get(walletState).wallet);
  if (!privacy || !wallet) return false;

  busy.set(true);
  error.set(null);
  try {
    step.set(`${label}: proving and submitting…`);
    const { transactionHash, trackingId } = await privacy.send(compose, {
      wait: { onAttempt: logAttempts(label) },
      ...options,
    });
    // The tracking id cannot be looked up later, so it is logged now: it is what
    // a relayer operator asks for about a transaction that misbehaved.
    log(
      `${label} submitted by the paymaster's relayer: ${transactionHash}` +
        (trackingId ? ` (tracking ${trackingId})` : ""),
      "success"
    );

    // The relayer's hash means the transaction was broadcast, not that it
    // worked. Waiting for the receipt is what turns a revert into an error
    // instead of a success message.
    step.set(`${label}: waiting for it to execute…`);
    await new Tx(
      transactionHash,
      wallet.getProvider(),
      wallet.getChainId()
    ).wait();
    log(`${label} executed on-chain`, "success");

    step.set(`${label}: refreshing…`);
    fee.set(await privacy.quote());
    await refresh();
    return true;
  } catch (err) {
    fail(label, err);
    return false;
  } finally {
    waitingBlocks.set(null);
    step.set(null);
    busy.set(false);
  }
}

/**
 * Deposit into the pool.
 *
 * The ERC20 `approve` is transparent either way — the pool pulls public funds, so
 * that step names the account whatever happens. {@link approveMode} decides only
 * whether it travels as its own transaction or inside the paymaster's bundle.
 *
 * Either way the approve does not have to age: it is checked when the deposit
 * executes, not when it is proven. What must be visible at the proving block is
 * the *balance*, which `waitForFundedBalance` checks directly, covering funds
 * that arrived in a transaction this app did not send. Bundling saves a
 * transaction, not that wait.
 *
 * This is also where registration happens: `autoRegister` folds it in, and a
 * standalone register could not pay the pool fee from an empty balance.
 */
export async function deposit(token: Token, input: string): Promise<boolean> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet || !PRIVACY_CONFIG || !input.trim()) return false;

  const amount = Amount.parse(input, token);
  const pool = fromAddress(PRIVACY_CONFIG.poolContractAddress);
  const bundled = get(approveMode) === "bundled";

  busy.set(true);
  error.set(null);
  try {
    // Built the same way for both modes; only the destination differs. `calls()`
    // resolves the builder without sending, which is exactly what `invoke` takes.
    const approveCalls = await wallet.tx().approve(token, pool, amount).calls();

    if (bundled) {
      log(
        "approve bundled into the privacy transaction — the relayer submits it " +
          "through the account's execute_from_outside, so there is no separate " +
          "transaction to sign or wait for",
        "info"
      );
    } else {
      step.set("Deposit: approving…");
      const approve = await wallet
        .tx()
        .add(...approveCalls)
        .send();
      await approve.wait();
      log(`approve ${approve.hash} landed (separate transaction)`, "info");
    }

    step.set("Deposit: waiting for the balance to be visible…");
    // Overrides the client's own sequencing: this proof reads the depositor's
    // ERC20 balance, which the client has no way to know about.
    const provingBlockId = await waitForFundedBalance(
      wallet.getProvider(),
      token,
      fromAddress(wallet.address),
      amount.toBase(),
      { onAttempt: logAttempts("Deposit · balance visible") }
    );

    return await run(
      "Deposit",
      (b) =>
        b
          .with(token.address, (t) => t.deposit({ amount: amount.toBase() }))
          .surplusTo(wallet.address),
      {
        autoRegister: true,
        autoSetup: true,
        autoDiscover: { notes: "refresh", channels: "refresh" },
        ...(bundled && { invoke: approveCalls }),
        provingBlockId,
      }
    );
  } catch (err) {
    fail("Deposit", err);
    return false;
  } finally {
    waitingBlocks.set(null);
    step.set(null);
    busy.set(false);
  }
}

export function transfer(
  token: Token,
  recipient: string,
  input: string
): Promise<boolean> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet) return Promise.resolve(false);
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
): Promise<boolean> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet || !recipient.trim()) return Promise.resolve(false);
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

function fail(what: string, err: unknown): void {
  const reason = describe(err);
  error.set(reason);
  log(`${what} failed: ${reason}`, "error");
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
