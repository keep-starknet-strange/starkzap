import { create } from "zustand";
import {
  Amount,
  fromAddress,
  Tx,
  type Token,
  type Wallet,
  type WalletInterface,
} from "starkzap-native";
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
} from "starkzap-native/privacy";
import { paymasterProxyUrl, privacyConfig } from "@/core/config";
import { feeOptions } from "@/core/settings";
import { NETWORKS } from "@/core/network";
import { useTokensStore } from "@/core/tokens/store";
import { useWalletStore } from "@/core/wallet/store";

/** Private balance for one token. */
export interface PrivacyBalance {
  token: Token;
  amount: Amount;
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

/** A withdrawal to a public address, for either simulating or sending. */
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

interface Strk20Store {
  client: PrivacyClient | null;
  connecting: boolean;
  busy: boolean;
  /** Human-readable stage of a multi-step operation, shown while busy. */
  step: string | null;
  error: string | null;
  registered: boolean | null;
  balances: PrivacyBalance[];

  /** Blocks still to wait before the next proof can be built, or null. */
  waitingBlocks: number | null;
  /** Pool fee the paymaster last quoted, shown before the user commits. */
  fee: PrivacyFeeQuote | null;
  /** A simulated send waiting on the user to confirm or cancel it. */
  pending: PendingSend | null;

  connect: () => Promise<void>;
  clear: () => void;
  confirmPending: () => Promise<boolean>;
  cancelPending: () => void;
  refresh: () => Promise<void>;
  deposit: (token: Token, input: string) => Promise<boolean>;
  transfer: (
    token: Token,
    recipient: string,
    input: string
  ) => Promise<boolean>;
  withdraw: (
    token: Token,
    recipient: string,
    input: string
  ) => Promise<boolean>;
  /** Simulate a transfer and park the result for the user to read. */
  simulateTransfer: (
    token: Token,
    recipient: string,
    input: string
  ) => Promise<void>;
  /** Simulate a withdrawal and park the result for the user to read. */
  simulateWithdraw: (
    token: Token,
    recipient: string,
    input: string
  ) => Promise<void>;
  recipientReady: (recipient: string) => Promise<boolean>;
}

/**
 * The quoted fee as something a person can read.
 *
 * `feeAction` gives base units and a token address, which is the whole cost to
 * the user but unreadable as-is. The pool fee does not depend on what the
 * transaction does — the paymaster quotes it per pool, not per action — so this
 * one figure covers every send.
 */
export function feeLabel(
  quote: PrivacyFeeQuote | null,
  tokens: Token[]
): string | null {
  if (!quote) return null;
  const { amount, token: address } = quote.feeAction;
  if (amount === 0n) return "No pool fee on this deployment.";

  const token = tokens.find((t) => BigInt(t.address) === BigInt(address));
  // A fee token that is not in the list still has to render: base units name
  // the cost badly, but silence names it not at all.
  return token
    ? Amount.fromRaw(amount, token).toFormatted(true)
    : `${amount} base units of ${address}`;
}

/** Why the STRK20 tab cannot be used on this network, or null when it can. */
export function unavailableReason(
  networkIndex: number,
  walletType: string | null
): string | null {
  const network = NETWORKS[networkIndex].chainId.isSepolia()
    ? "sepolia"
    : "mainnet";
  if (!privacyConfig(network, paymasterProxyUrl(network) || null)) {
    return (
      `Set EXPO_PUBLIC_PRIVACY_POOL_*, EXPO_PUBLIC_PRIVACY_PROVER_* and ` +
      `EXPO_PUBLIC_PRIVACY_DISCOVERY_* for ${network}, plus ` +
      `EXPO_PUBLIC_PAYMASTER_PROXY_URL_${network.toUpperCase()} — privacy transactions are submitted by a ` +
      `paymaster's relayer, which is what keeps your account off-chain.`
    );
  }
  if (walletType !== "privatekey") {
    return "The privacy pool needs a private-key login: the viewing key is derived from a deterministic signature, which Privy and Cartridge signers do not provide.";
  }
  return null;
}

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

export const useStrk20Store = create<Strk20Store>((set, get) => {
  /**
   * Log every poll of a block wait, and mirror it into `waitingBlocks`.
   *
   * The wait is otherwise invisible: an operation that blocks for eight blocks
   * looks identical to one that hung.
   */
  function onWait({ attempt, head, provingBlock, ready }: ProvableAttempt) {
    set({
      waitingBlocks: ready ? null : Math.max(1, provingBlock + 1 - head + 10),
      step: ready ? null : `Waiting for block ${provingBlock + 10}…`,
    });
    void attempt;
  }

  /**
   * Run what `send` would run, without proving it.
   *
   * `simulate` takes the same callback and options, quotes the same fee and
   * appends the same withdrawal, then runs against a mock prover. So the warnings
   * are the ones the real transaction would raise — a withdrawal back to the
   * deposit address raises `USER_LINKAGE` — and nothing has been paid for when
   * the user reads them.
   *
   * `send`'s own `onWarnings` callback reports the same list, but only after the
   * proof exists and has been paid for. Declining there wastes the proving.
   *
   * @returns The warnings, or null when the simulation itself failed
   */
  async function simulateOp(
    op: Operation
  ): Promise<PrivacySimulation["warnings"] | null> {
    const privacy = get().client;
    if (!privacy) return null;

    set({
      busy: true,
      error: null,
      step: `${op.label}: simulating…`,
      pending: null,
    });
    try {
      const { warnings } = await privacy.simulate(op.compose, op.options);
      return warnings;
    } catch (err) {
      set({ error: describe(err) });
      return null;
    } finally {
      set({ step: null, busy: false });
    }
  }

  /** Simulate and show the result, whether or not it warned. */
  async function preview(op: Operation): Promise<void> {
    const warnings = await simulateOp(op);
    if (warnings) set({ pending: { ...op, warnings } });
  }

  /** Simulate, then send straight away unless there is something to read. */
  async function run(op: Operation): Promise<boolean> {
    const warnings = await simulateOp(op);
    if (!warnings) return false;
    if (warnings.length > 0) {
      set({ pending: { ...op, warnings } });
      return false;
    }
    return submit(op);
  }

  /**
   * Prove and submit one privacy operation.
   *
   * `send()` owns the fee, the proving block and submission, so all this adds is
   * UI state: the busy flag, the step label, and error translation.
   */
  async function submit({
    label,
    compose,
    options,
  }: Operation): Promise<boolean> {
    const privacy = get().client;
    const wallet = localWallet(useWalletStore.getState().wallet);
    if (!privacy || !wallet) return false;

    set({ busy: true, error: null, step: `${label}: proving and submitting…` });
    try {
      const { transactionHash } = await privacy.send(compose, {
        wait: { onAttempt: onWait },
        ...options,
      });

      // The relayer's hash means the transaction was broadcast, not that it
      // worked. Waiting for the receipt is what turns a revert into an error
      // instead of a success message.
      set({ step: `${label}: waiting for it to execute…` });
      await new Tx(
        transactionHash,
        wallet.getProvider(),
        wallet.getChainId()
      ).wait();

      set({ step: `${label}: refreshing…`, fee: await privacy.quote() });
      await get().refresh();
      return true;
    } catch (err) {
      set({ error: describe(err) });
      return false;
    } finally {
      set({ waitingBlocks: null, step: null, busy: false });
    }
  }

  return {
    client: null,
    connecting: false,
    busy: false,
    step: null,
    error: null,
    registered: null,
    balances: [],
    waitingBlocks: null,
    fee: null,
    pending: null,

    /** Submit the operation the user just confirmed, warnings and all. */
    confirmPending: async () => {
      const held = get().pending;
      if (!held) return false;
      set({ pending: null });
      return submit(held);
    },

    cancelPending: () => set({ pending: null }),

    /**
     * Drop the privacy capability, revoking the viewing key with it.
     *
     * Call this on logout, on network switch and before every login. The client
     * holds a live viewing key, so releasing the reference alone would leave the
     * key usable by anything still holding one — and this store outlives the
     * login that created it.
     */
    clear: () => {
      const current = get().client;
      set({
        client: null,
        registered: null,
        balances: [],
        waitingBlocks: null,
        fee: null,
        error: null,
        pending: null,
      });
      if (current) revokePrivacy(current.transfers);
    },

    connect: async () => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      const network = NETWORKS[
        useWalletStore.getState().networkIndex
      ].chainId.isSepolia()
        ? "sepolia"
        : "mainnet";
      const config = privacyConfig(network, paymasterProxyUrl(network) || null);
      // `unavailableReason` already tells the user when the config is missing;
      // this guard is what narrows it for `connectPrivacy`.
      if (!wallet || !config) return;
      set({ connecting: true, error: null });
      try {
        // Cached per wallet and revoked on `wallet.disconnect()`, so repeated
        // calls are cheap and the viewing key does not outlive the session.
        const privacy = await connectPrivacy(wallet, config);
        set({ client: privacy, fee: await privacy.quote() });
        await get().refresh();
      } catch (err) {
        set({ error: describe(err), client: null });
      } finally {
        set({ connecting: false });
      }
    },

    refresh: async () => {
      const privacy = get().client;
      const wallet = useWalletStore.getState().wallet;
      if (!privacy || !wallet) return;

      try {
        const tokens = useTokensStore.getState().tokens;
        // One discovery call covers every token, so balances are a grouping.
        const { notes } = await privacy.discoverNotes();

        set({
          balances: tokens.map((token) => {
            const owned = notes.get(BigInt(token.address)) ?? [];
            const total = owned.reduce((sum, note) => sum + note.amount, 0n);
            return {
              token,
              amount: Amount.fromRaw(total, token),
              notes: owned.length,
            };
          }),
        });

        // Registration is per account, not per token, so any token answers it.
        const probe = tokens[0];
        if (probe) {
          const requirement = await privacy.discoverRequirement(
            wallet.address,
            probe.address
          );
          set({ registered: requirement !== 0 }); // SetupRequirement.Register === 0
        }
      } catch (err) {
        set({ error: describe(err) });
      }
    },

    /**
     * Deposit into the pool.
     *
     * Two transactions: the ERC20 approve is transparent and cannot share the
     * privacy transaction, because the proof owns that one. The approve does not
     * have to age — it is checked when the deposit executes, not when it is
     * proven — so the deposit follows straight after it. What must be visible at
     * the proving block is the *balance*, which `waitForFundedBalance` checks
     * directly, covering funds that arrived in a transaction this app did not
     * send.
     *
     * This is also where registration happens: `autoRegister` folds it in, and a
     * standalone register could not pay the pool fee from an empty balance.
     */
    deposit: async (token, input) => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      const network = NETWORKS[
        useWalletStore.getState().networkIndex
      ].chainId.isSepolia()
        ? "sepolia"
        : "mainnet";
      const config = privacyConfig(network, paymasterProxyUrl(network) || null);
      if (!wallet || !config || !input.trim()) return false;

      const amount = Amount.parse(input, token);
      set({ busy: true, error: null, step: "Deposit: approving…" });
      try {
        const tx = await wallet
          .tx()
          .approve(token, fromAddress(config.poolContractAddress), amount)
          .send(feeOptions());
        await tx.wait();

        set({ step: "Deposit: waiting for the balance to be visible…" });
        // This proof reads the depositor's ERC20 balance, which the client
        // cannot know about. This block is already `PROOF_BASE_BLOCK_DEPTH`
        // behind the head, and passing it does not bypass the client's own
        // sequencing: the client uses it only if it is at or after the block its
        // last private transaction landed in, and waits for a later one
        // otherwise.
        const provingBlockId = await waitForFundedBalance(
          wallet.getProvider(),
          token,
          fromAddress(wallet.address),
          amount.toBase(),
          { onAttempt: onWait }
        );

        // Submitted without the warning check the other two get. The approve is
        // already on-chain by now, so a confirmation here would arrive after the
        // step that costs money — and a deposit names the account publicly
        // whatever happens, so `USER_LINKAGE` would tell the user nothing the
        // form does not already say.
        return await submit({
          label: "Deposit",
          compose: (b) =>
            b
              .with(token.address, (t) =>
                t.deposit({ amount: amount.toBase() })
              )
              .surplusTo(wallet.address),
          options: {
            autoRegister: true,
            autoSetup: true,
            autoDiscover: { notes: "refresh", channels: "refresh" },
            provingBlockId,
          },
        });
      } catch (err) {
        set({ error: describe(err) });
        return false;
      } finally {
        set({ waitingBlocks: null, step: null, busy: false });
      }
    },

    transfer: (token, recipient, input) => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      if (!wallet) return Promise.resolve(false);
      return run(transferOp(token, recipient, input, wallet.address));
    },

    simulateTransfer: async (token, recipient, input) => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      if (!wallet) return;
      await preview(transferOp(token, recipient, input, wallet.address));
    },

    /**
     * Withdraw to a public address.
     *
     * The recipient is explicit rather than defaulting to this wallet: a deposit
     * and a withdrawal are both public, so sending funds back to the address
     * they came from puts the pool's two ends on one address and links them.
     * Withdrawing to yourself is legitimate — it just has to be a choice.
     */
    withdraw: (token, recipient, input) => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      if (!wallet || !recipient.trim()) return Promise.resolve(false);
      return run(withdrawOp(token, recipient, input, wallet.address));
    },

    simulateWithdraw: async (token, recipient, input) => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      if (!wallet || !recipient.trim()) return;
      await preview(withdrawOp(token, recipient, input, wallet.address));
    },

    /**
     * Whether a recipient can receive a private transfer yet.
     *
     * The SDK cannot build a transfer to an account with no viewing key
     * registered on the pool, so the UI checks before offering the action. This
     * asks the same question the compiler asks — does the recipient have channel
     * context — because that is what a transfer needs and what it fails on.
     *
     * `discoverRequirement` looks like the call for this and is not. Against the
     * indexer discovery service its `Register` verdict reports whether the
     * *sender* is registered, so once you have deposited it answers "ready" for
     * any address at all, and the transfer then dies inside the compiler with
     * "Missing channel context for recipient". Only the on-chain discovery
     * provider gives that verdict the meaning its name suggests, which is why
     * the mock-backed tests never saw it.
     *
     * A recipient who is registered but has no channel with us yet passes, as it
     * should: opening that channel is exactly what `autoSetup` does.
     */
    recipientReady: async (recipient) => {
      const privacy = get().client;
      const address = recipient.trim();
      if (!privacy || !address) return false;
      try {
        const { channels } = await privacy.discoverChannels([address]);
        return Boolean(channels?.get(address)?.publicKey);
      } catch {
        return false;
      }
    },
  };
});
