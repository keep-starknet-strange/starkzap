import { writable, derived, get } from "svelte/store";
import {
  Amount,
  fromAddress,
  Tx,
  type Token,
  type Wallet,
  type WalletInterface,
} from "starkzap";
import {
  connectPrivacy,
  revokePrivacy,
  screeningVerdict,
  waitForFundedBalance,
  type PrivacyClient,
  type PrivacyFeeQuote,
  type PrivacySendOptions,
  type PrivacySimulation,
  type ProvableAttempt,
} from "starkzap/privacy";
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

/**
 * One privacy operation, built but not run.
 *
 * Named so simulating and sending take the *same* value: the form is read once,
 * and both paths use what it produced. Rebuilding from the inputs for the second
 * path would let a user simulate one transaction and send another.
 */
interface Operation {
  label: string;
  compose: Parameters<PrivacyClient["send"]>[0];
  options: PrivacySendOptions | undefined;
}

/** An operation that has been simulated and is waiting on the user. */
export interface PendingSend extends Operation {
  warnings: PrivacySimulation["warnings"];
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

/** A simulated send waiting on the user to confirm or cancel it. */
export const pending = writable<PendingSend | null>(null);

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
 * `getAccountProvider()` is defined on `Wallet` but not on `WalletInterface`,
 * because it exposes the signer — which is what derives the viewing key, and what
 * `CartridgeWallet` cannot provide. Testing for the method is the runtime mirror
 * of that compile-time gate.
 */
function localWallet(wallet: WalletInterface | null): Wallet | null {
  return wallet && "getAccountProvider" in wallet ? (wallet as Wallet) : null;
}

/** Why the STRK20 tab cannot be used, or null when it can. */
export function unavailableReason(walletType: string | null): string | null {
  if (!PRIVACY_CONFIG) {
    return "Set VITE_PRIVACY_POOL_*, VITE_PRIVACY_PROVER_* and VITE_PRIVACY_DISCOVERY_* for this network in .env.";
  }
  if (walletType !== "privatekey") {
    return "The privacy pool needs a private-key login: the viewing key is derived from the account key inside the signer, which the Privy and Cartridge signers cannot do.";
  }
  return null;
}

/**
 * Cancels the block waits of whatever operation is in flight.
 *
 * Module-global like the stores, and for the same reason: the operation outlives
 * the component that started it.
 */
let inFlight: AbortController | null = null;

/**
 * Drop the privacy capability, revoking the viewing key with it.
 *
 * Call this on logout and before every login. The client holds a live viewing
 * key, so releasing the reference alone would leave the key usable by anything
 * still holding one — and this store is module-global, so it outlives the login
 * that created it.
 */
export function clear(): void {
  // The waits are the long part of a send — minutes of polling — and they are
  // what leaves the UI looking stuck after a logout. Proving is not cancellable,
  // so an operation already past that point still submits; the SDK says as much.
  inFlight?.abort(new Error("The privacy session was closed."));
  inFlight = null;

  const current = get(client);
  client.set(null);
  if (current) revokePrivacy(current.transfers);
  registered.set(null);
  balances.set([]);
  waitingBlocks.set(null);
  fee.set(null);
  error.set(null);
  pending.set(null);
  // Owned by an operation that is no longer going to finish, so nothing else
  // will clear them: a `busy` left set disables every button until a reload.
  busy.set(false);
  step.set(null);
  connecting.set(false);
}

/** Create the privacy client from the SDK config and load state. */
export async function connect(): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  // `unavailableReason` already tells the user when the config is missing; this
  // guard is what narrows it for `connectPrivacy`.
  if (!wallet || !PRIVACY_CONFIG) return;
  connecting.set(true);
  error.set(null);
  try {
    // Cached per wallet and revoked on `wallet.disconnect()`, so repeated calls
    // are cheap and the viewing key does not outlive the session.
    const privacy = await connectPrivacy(wallet, PRIVACY_CONFIG);
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

    const held = list.map((token) => {
      const owned = notes.get(BigInt(token.address)) ?? [];
      const total = owned.reduce((sum, note) => sum + note.amount, 0n);
      return {
        token,
        private: Amount.fromRaw(total, token),
        notes: owned.length,
        each: owned.map((note) => Amount.fromRaw(note.amount, token)),
      };
    });
    balances.set(held);

    // The individual notes, not just the total: a total cannot distinguish a send
    // that spent the note the previous one produced from a send that spent an
    // untouched one, and the panel only ever shows the latest reading anyway.
    const summary = held
      .filter((b) => b.notes > 0)
      .map(
        (b) =>
          `${b.private.toFormatted(true)} across ${b.notes} note${b.notes === 1 ? "" : "s"} ` +
          `[${b.each.map((a) => a.toFormatted()).join(", ")}]`
      )
      .join("; ");
    log(`private balances: ${summary || "none"}`, "info");

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
 * Simulate one operation, then submit it unless it warns.
 *
 * `simulate` runs what `send` would run against a mock prover: same fee quote,
 * same fee withdrawal, same warnings — but no proof, so nothing has been paid for
 * when the user sees them. A withdrawal back to the deposit address raises
 * `USER_LINKAGE` here, which is the whole point of asking first.
 *
 * The alternative is `send`'s own `onWarnings` callback, which reports the same
 * list. That one fires after the proof exists and has been paid for, so declining
 * there wastes the proving.
 *
 * @returns Whether the transaction executed. False also means either the error
 *   store or the pending store holds the reason, so a caller can keep the user's
 *   input for a retry.
 */
async function simulateOp(
  op: Operation
): Promise<PrivacySimulation["warnings"] | null> {
  const privacy = get(client);
  if (!privacy) return null;

  busy.set(true);
  error.set(null);
  pending.set(null);
  try {
    step.set(`${op.label}: simulating…`);
    const { warnings } = await privacy.simulate(op.compose, op.options);
    log(
      warnings.length === 0
        ? `${op.label} simulated clean — no warnings`
        : `${op.label} raised ${warnings.length} warning(s) before proving: ` +
            warnings.map((w) => w.code).join(", "),
      "info"
    );
    return warnings;
  } catch (err) {
    fail(op.label, err);
    return null;
  } finally {
    step.set(null);
    busy.set(false);
  }
}

/** Simulate and show the result, whether or not it warned. */
export async function preview(op: Operation): Promise<void> {
  const warnings = await simulateOp(op);
  if (warnings) pending.set({ ...op, warnings });
}

/** Simulate, then send straight away unless there is something to read. */
async function run(op: Operation): Promise<boolean> {
  const warnings = await simulateOp(op);
  if (!warnings) return false;
  if (warnings.length > 0) {
    pending.set({ ...op, warnings });
    return false;
  }
  return submit(op);
}

/** Submit the operation the user just confirmed, warnings and all. */
export async function confirmPending(): Promise<boolean> {
  const held = get(pending);
  if (!held) return false;
  pending.set(null);
  return submit(held);
}

export function cancelPending(): void {
  pending.set(null);
}

/**
 * Prove and submit one privacy operation.
 *
 * `send()` owns the fee, the proving block and submission, so all this adds is
 * UI state: the busy flag, the step label, and error translation.
 *
 * @returns Whether the transaction executed. False also means the error store
 *   holds the reason, so a caller can keep the user's input for a retry.
 */
async function submit({
  label,
  compose,
  options,
}: Operation): Promise<boolean> {
  const privacy = get(client);
  const wallet = localWallet(get(walletState).wallet);
  if (!privacy || !wallet) return false;

  const abort = new AbortController();
  inFlight = abort;
  busy.set(true);
  error.set(null);
  try {
    step.set(`${label}: proving and submitting…`);
    const { transactionHash, trackingId } = await privacy.send(compose, {
      wait: {
        onAttempt: logAttempts(label),
        signal: abort.signal,
        // Faster than the 2s default because Sepolia blocks land every 1-2s: at
        // the default the poll steps over head values, and the log then shows a
        // proving block chosen a block later than the wait actually allowed.
        pollIntervalMs: 500,
      },
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
    const tx = new Tx(
      transactionHash,
      wallet.getProvider(),
      wallet.getChainId()
    );
    await tx.wait();
    // The block is logged because it is what the *next* send is sequenced
    // against: that one proves at this block or later, never before it. Without
    // it the log cannot show whether the proving block that follows was right.
    const receipt = await tx.receipt();
    log(
      `${label} executed on-chain` +
        (receipt.isError() ? "" : ` in block ${receipt.block_number}`),
      "success"
    );

    // Past the receipt, the funds have moved. What follows is bookkeeping, and a
    // quote or a refresh that fails must not be reported as a failed transaction.
    step.set(`${label}: refreshing…`);
    try {
      fee.set(await privacy.quote());
      await refresh();
    } catch (err) {
      error.set(
        `${label} executed on-chain, but reloading the balances failed: ${describe(err)}`
      );
    }
    return true;
  } catch (err) {
    // A logout cancelled it. The user asked for that, and the stores this would
    // write to were just cleared.
    if (!abort.signal.aborted) fail(label, err);
    return false;
  } finally {
    if (inFlight === abort) inFlight = null;
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

  const pool = fromAddress(PRIVACY_CONFIG.poolContractAddress);
  const bundled = get(approveMode) === "bundled";

  const abort = new AbortController();
  inFlight = abort;
  busy.set(true);
  error.set(null);
  try {
    // Inside the try: a rejected amount is user input, not a broken deposit, and
    // parsing it outside meant the throw escaped into an unhandled rejection.
    const amount = Amount.parse(input, token);
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
    // This proof reads the depositor's ERC20 balance, which the client has no
    // way to know about. This block is already `PROOF_BASE_BLOCK_DEPTH` behind
    // the head, and passing it does not bypass the client's own sequencing: the
    // client uses it only if it is at or after the block its last private
    // transaction landed in, and waits for a later one otherwise.
    const provingBlockId = await waitForFundedBalance(
      wallet.getProvider(),
      token,
      fromAddress(wallet.address),
      amount.toBase(),
      {
        onAttempt: logAttempts("Deposit · balance visible"),
        signal: abort.signal,
      }
    );

    // Submitted without the warning check the other two get. The approve is
    // already on-chain by now (or bundled into this very transaction), so a
    // confirmation here would arrive after the step that costs money — and a
    // deposit names the account publicly whatever happens, so `USER_LINKAGE`
    // would tell the user nothing the form does not already say.
    return await submit({
      label: "Deposit",
      compose: (b) =>
        b
          .with(token.address, (t) => t.deposit({ amount: amount.toBase() }))
          .surplusTo(wallet.address),
      options: {
        autoRegister: true,
        autoSetup: true,
        autoDiscover: { notes: "refresh", channels: "refresh" },
        ...(bundled && { invoke: approveCalls }),
        provingBlockId,
      },
    });
  } catch (err) {
    if (!abort.signal.aborted) fail("Deposit", err);
    return false;
  } finally {
    if (inFlight === abort) inFlight = null;
    waitingBlocks.set(null);
    step.set(null);
    busy.set(false);
  }
}

/** A private transfer, for either simulating or sending. */
function transferOp(
  token: Token,
  recipient: string,
  input: string,
  surplusTo: string
): Operation {
  const amount = Amount.parse(input, token);
  return {
    label: "Transfer",
    compose: (b) =>
      b
        .with(token.address, (t) =>
          t.transfer({ recipient: recipient.trim(), amount: amount.toBase() })
        )
        .surplusTo(surplusTo),
    options: {
      autoSetup: true,
      autoSelectNotes: "naive",
      autoDiscover: { notes: "refresh", channels: "refresh" },
    },
  };
}

export function transfer(
  token: Token,
  recipient: string,
  input: string
): Promise<boolean> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet) return Promise.resolve(false);
  const op = build(() => transferOp(token, recipient, input, wallet.address));
  return op ? run(op) : Promise.resolve(false);
}

/** Simulate a transfer and park the result for the user to read. */
export async function simulateTransfer(
  token: Token,
  recipient: string,
  input: string
): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet) return;
  const op = build(() => transferOp(token, recipient, input, wallet.address));
  if (op) await preview(op);
}

/**
 * Withdraw to a public address.
 *
 * The recipient is explicit rather than defaulting to this wallet: a deposit and
 * a withdrawal are both public, so sending funds back to the address they came
 * from puts the pool's two ends on one address and links them. Withdrawing to
 * yourself is legitimate — it just has to be a choice, not a default.
 */
function withdrawOp(
  token: Token,
  recipient: string,
  input: string,
  surplusTo: string
): Operation {
  const amount = Amount.parse(input, token);
  return {
    label: "Withdraw",
    compose: (b) =>
      b
        .with(token.address, (t) =>
          t.withdraw({ recipient: recipient.trim(), amount: amount.toBase() })
        )
        // Surplus is a *private* note, so it stays in the pool with us.
        .surplusTo(surplusTo),
    options: {
      autoSelectNotes: "naive",
      autoDiscover: { notes: "refresh", channels: "refresh" },
    },
  };
}

export function withdraw(
  token: Token,
  recipient: string,
  input: string
): Promise<boolean> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet || !recipient.trim()) return Promise.resolve(false);
  const op = build(() => withdrawOp(token, recipient, input, wallet.address));
  return op ? run(op) : Promise.resolve(false);
}

/** Simulate a withdrawal and park the result for the user to read. */
export async function simulateWithdraw(
  token: Token,
  recipient: string,
  input: string
): Promise<void> {
  const wallet = localWallet(get(walletState).wallet);
  if (!wallet || !recipient.trim()) return;
  const op = build(() => withdrawOp(token, recipient, input, wallet.address));
  if (op) await preview(op);
}

/**
 * Whether a recipient can receive a private transfer yet.
 *
 * The SDK cannot build a transfer to an account with no viewing key registered
 * on the pool, so the UI checks before offering the action. This asks the same
 * question the compiler asks — does the recipient have channel context — because
 * that is what a transfer needs and what it fails on.
 *
 * `discoverRequirement` looks like the call for this and is not. Against the
 * indexer discovery service its `Register` verdict reports whether the *sender*
 * is registered, so once you have deposited it answers "ready" for any address
 * at all, and the transfer then dies inside the compiler with "Missing channel
 * context for recipient". Only the on-chain discovery provider gives that verdict
 * the meaning its name suggests, which is why the mock-backed tests never saw it.
 *
 * A recipient who is registered but has no channel with us yet passes, as it
 * should: opening that channel is exactly what `autoSetup` does.
 */
export async function recipientReady(recipient: string): Promise<boolean> {
  const privacy = get(client);
  const address = recipient.trim();
  if (!privacy || !address) return false;
  try {
    const { channels } = await privacy.discoverChannels([address]);
    return Boolean(channels?.get(address)?.publicKey);
  } catch {
    return false;
  }
}

/**
 * Build an operation, reporting a bad amount rather than throwing.
 *
 * `Amount.parse` rejects input the form still accepts — "1.2.3", or more decimal
 * places than the token has. Thrown from a click handler it escapes this store's
 * error handling entirely: an unhandled rejection, and a UI that does nothing.
 */
function build(make: () => Operation): Operation | null {
  try {
    return make();
  } catch (err) {
    fail("Reading the amount", err);
    return null;
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
