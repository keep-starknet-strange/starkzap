import { create } from "zustand";
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
} from "starkzap-native";
import { paymasterProxyUrl, privacyConfig } from "@/core/config";
import { NETWORKS } from "@/core/network";
import { useTokensStore } from "@/core/tokens/store";
import { useWalletStore } from "@/core/wallet/store";

/** Private balance for one token. */
export interface PrivacyBalance {
  token: Token;
  amount: Amount;
  notes: number;
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

  connect: () => Promise<void>;
  clear: () => void;
  refresh: () => Promise<void>;
  deposit: (token: Token, input: string) => Promise<void>;
  transfer: (token: Token, recipient: string, input: string) => Promise<void>;
  withdraw: (token: Token, recipient: string, input: string) => Promise<void>;
  recipientReady: (recipient: string, token: Token) => Promise<boolean>;
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
 * `privacy()` is defined on `Wallet` but not on `WalletInterface`, because
 * `CartridgeWallet` cannot derive a viewing key. Testing for the method is the
 * runtime mirror of that compile-time gate.
 */
function localWallet(wallet: WalletInterface | null): Wallet | null {
  return wallet && "privacy" in wallet ? (wallet as Wallet) : null;
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
   * Run one privacy operation through the client.
   *
   * `send()` owns the fee, the proving block and submission, so all this adds is
   * UI state: the busy flag, the step label, and error translation.
   */
  async function run(
    label: string,
    compose: Parameters<PrivacyClient["send"]>[0],
    options?: PrivacySendOptions
  ) {
    const privacy = get().client;
    if (!privacy) return;

    set({ busy: true, error: null, step: `${label}: proving and submitting…` });
    try {
      await privacy.send(compose, { wait: { onAttempt: onWait }, ...options });
      set({ step: `${label}: refreshing…`, fee: await privacy.quote() });
      await get().refresh();
    } catch (err) {
      set({ error: describe(err) });
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

    clear: () => {
      set({
        client: null,
        registered: null,
        balances: [],
        waitingBlocks: null,
        fee: null,
        error: null,
      });
    },

    connect: async () => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      if (!wallet) return;
      set({ connecting: true, error: null });
      try {
        // `wallet.privacy()` reads `privacy` from the SDK config and caches the
        // client, so repeated calls are cheap.
        const privacy = await wallet.privacy();
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
      if (!wallet || !config || !input.trim()) return;

      const amount = Amount.parse(input, token);
      set({ busy: true, error: null, step: "Deposit: approving…" });
      try {
        const tx = await wallet
          .tx()
          .approve(token, fromAddress(config.poolContractAddress), amount)
          .send();
        await tx.wait();

        set({ step: "Deposit: waiting for the balance to be visible…" });
        // Overrides the client's own sequencing: this proof reads the
        // depositor's ERC20 balance, which the client cannot know about.
        const provingBlockId = await waitForFundedBalance(
          wallet.getProvider(),
          token,
          fromAddress(wallet.address),
          amount.toBase(),
          { onAttempt: onWait }
        );

        await run(
          "Deposit",
          (b) =>
            b
              .with(token.address, (t) =>
                t.deposit({ amount: amount.toBase() })
              )
              .surplusTo(wallet.address),
          {
            autoRegister: true,
            autoSetup: true,
            autoDiscover: { notes: "refresh", channels: "refresh" },
            provingBlockId,
          }
        );
      } catch (err) {
        set({ error: describe(err) });
      } finally {
        set({ waitingBlocks: null, step: null, busy: false });
      }
    },

    transfer: (token, recipient, input) => {
      const wallet = localWallet(useWalletStore.getState().wallet);
      if (!wallet) return Promise.resolve();
      const amount = Amount.parse(input, token);

      return run(
        "Transfer",
        (b) =>
          b
            .with(token.address, (t) =>
              t.transfer({
                recipient: recipient.trim(),
                amount: amount.toBase(),
              })
            )
            .surplusTo(wallet.address),
        {
          autoSetup: true,
          autoSelectNotes: "naive",
          autoDiscover: { notes: "refresh", channels: "refresh" },
        }
      );
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
      if (!wallet || !recipient.trim()) return Promise.resolve();
      const amount = Amount.parse(input, token);

      return run(
        "Withdraw",
        (b) =>
          b
            .with(token.address, (t) =>
              t.withdraw({
                recipient: recipient.trim(),
                amount: amount.toBase(),
              })
            )
            // Surplus is a *private* note, so it stays in the pool with us.
            .surplusTo(wallet.address),
        {
          autoSelectNotes: "naive",
          autoDiscover: { notes: "refresh", channels: "refresh" },
        }
      );
    },

    /**
     * Whether a recipient can receive a private transfer yet. The SDK cannot
     * build a transfer to an account with no viewing key on-chain, so the UI
     * checks before offering the action.
     */
    recipientReady: async (recipient, token) => {
      const privacy = get().client;
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
    },
  };
});
