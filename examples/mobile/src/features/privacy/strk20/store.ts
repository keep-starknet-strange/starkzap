import { create } from "zustand";
import {
  Amount,
  PROOF_BASE_BLOCK_DEPTH,
  fromAddress,
  screeningVerdict,
  waitForDeployedAccount,
  waitForFundedBalance,
  type Token,
  type Wallet,
  type WalletInterface,
} from "starkzap-native";
import type { RpcProvider } from "starknet";
import type { PrivateTransfersInterface } from "@starkware-libs/starknet-privacy-sdk";
import { privacyConfig } from "@/core/config";
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
  client: PrivateTransfersInterface | null;
  connecting: boolean;
  busy: boolean;
  /** Human-readable stage of a multi-step operation, shown while busy. */
  step: string | null;
  error: string | null;
  registered: boolean | null;
  balances: PrivacyBalance[];

  // Visible block wait: any on-chain state a proof reads must trail the chain
  // head by PROOF_BASE_BLOCK_DEPTH blocks. Rather than hide that inside a
  // spinner, the last transaction's block and the current head are both state
  // so the UI can show a countdown and disable actions until it clears.
  lastTxBlock: number | null;
  head: number | null;

  connect: () => Promise<void>;
  clear: () => void;
  refresh: () => Promise<void>;
  register: () => Promise<void>;
  deposit: (token: Token, input: string) => Promise<void>;
  transfer: (token: Token, recipient: string, input: string) => Promise<void>;
  withdraw: (token: Token, input: string) => Promise<void>;
  recipientReady: (recipient: string, token: Token) => Promise<boolean>;
}

/** Blocks still to wait before the next proof can be built. */
export function blocksUntilProvable(s: {
  lastTxBlock: number | null;
  head: number | null;
}): number {
  if (s.lastTxBlock === null || s.head === null) return 0;
  return Math.max(0, PROOF_BASE_BLOCK_DEPTH - (s.head - s.lastTxBlock) + 1);
}

/** Why the STRK20 tab cannot be used on this network, or null when it can. */
export function unavailableReason(
  networkIndex: number,
  walletType: string | null
): string | null {
  const network = NETWORKS[networkIndex].chainId.isSepolia()
    ? "sepolia"
    : "mainnet";
  if (!privacyConfig(network)) {
    return `Set EXPO_PUBLIC_PRIVACY_POOL_*, EXPO_PUBLIC_PRIVACY_PROVER_* and EXPO_PUBLIC_PRIVACY_DISCOVERY_* for ${network} in .env.`;
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

let poller: ReturnType<typeof setInterval> | null = null;

export const useStrk20Store = create<Strk20Store>((set, get) => {
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
      const wallet = useWalletStore.getState().wallet;
      if (!wallet) return stopPolling();
      set({ head: await wallet.getProvider().getBlockNumber() });
      if (blocksUntilProvable(get()) === 0) stopPolling();
    };
    void tick();
    poller = setInterval(() => void tick(), 5_000);
  }

  /** Record the block a transaction landed in and begin the countdown. */
  async function markSubmitted() {
    const wallet = useWalletStore.getState().wallet;
    if (!wallet) return;
    set({ lastTxBlock: await wallet.getProvider().getBlockNumber() });
    startPolling();
  }

  /**
   * Prove and submit one privacy transaction. The proof travels as
   * transaction-level fields, so it can never be batched with other calls.
   *
   * `provable` lets an operation demand more than the default depth: some
   * proofs read state this app never saw a receipt for (an account funded
   * elsewhere), so they check the state itself rather than counting blocks.
   */
  async function submit(
    label: string,
    compile: (
      transfers: PrivateTransfersInterface,
      provingBlockId: number
    ) => Promise<{ callAndProof: { call: never; proof: never } }>,
    provable?: (provider: RpcProvider) => Promise<number>
  ) {
    const transfers = get().client;
    const wallet = localWallet(useWalletStore.getState().wallet);
    if (!transfers || !wallet || blocksUntilProvable(get()) > 0) return;

    set({ busy: true, error: null });
    try {
      const provider = wallet.getProvider();
      set({ step: `${label}: checking state…` });
      const provingBlockId = provable
        ? await provable(provider)
        : (await provider.getBlockNumber()) - PROOF_BASE_BLOCK_DEPTH;

      set({ step: `${label}: proving…` });
      const { callAndProof } = await compile(transfers, provingBlockId);

      set({ step: `${label}: submitting…` });
      const tx = await wallet.execute([callAndProof.call], {
        proof: callAndProof.proof,
      });
      await tx.wait();
      await markSubmitted();

      set({ step: `${label}: refreshing…` });
      await get().refresh();
    } catch (err) {
      set({ error: describe(err) });
    } finally {
      set({ step: null, busy: false });
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
    lastTxBlock: null,
    head: null,

    clear: () => {
      stopPolling();
      set({
        client: null,
        registered: null,
        balances: [],
        lastTxBlock: null,
        head: null,
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
        set({ client: await wallet.privacy() });
        await get().refresh();
      } catch (err) {
        set({ error: describe(err), client: null });
      } finally {
        set({ connecting: false });
      }
    },

    refresh: async () => {
      const transfers = get().client;
      const wallet = useWalletStore.getState().wallet;
      if (!transfers || !wallet) return;

      try {
        const tokens = useTokensStore.getState().tokens;
        // One discovery call covers every token, so balances are a grouping.
        const { notes } = await transfers.discoverNotes();

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
          const requirement = await transfers.discoverRequirement(
            wallet.address,
            probe.address
          );
          set({ registered: requirement !== 0 }); // SetupRequirement.Register === 0
        }

        set({ head: await wallet.getProvider().getBlockNumber() });
      } catch (err) {
        set({ error: describe(err) });
      }
    },

    register: () => {
      const wallet = useWalletStore.getState().wallet;
      if (!wallet) return Promise.resolve();

      return submit(
        "Register",
        (transfers, provingBlockId) =>
          transfers.build({ provingBlockId }).register().execute() as never,
        // The proof reads the account's viewing-key slot, which only exists
        // once the deploy is finalized — registering right after deploying
        // would prove over a slot that isn't there yet.
        (provider) =>
          waitForDeployedAccount(provider, fromAddress(wallet.address))
      );
    },

    /**
     * Deposit into the pool.
     *
     * Two transactions: the ERC20 approve is transparent and cannot share the
     * privacy transaction, because the proof owns that one. The approve does
     * not have to age — it is checked when the deposit executes, not when it is
     * proven — so the deposit follows straight after it. What must be visible
     * at the proving block is the *balance*, which `waitForFundedBalance`
     * checks directly, covering accounts funded outside this app.
     */
    deposit: async (token, input) => {
      const wallet = useWalletStore.getState().wallet;
      const network = NETWORKS[
        useWalletStore.getState().networkIndex
      ].chainId.isSepolia()
        ? "sepolia"
        : "mainnet";
      const config = privacyConfig(network);
      if (!wallet || !config || !input.trim() || blocksUntilProvable(get()) > 0)
        return;

      const amount = Amount.parse(input, token);
      set({ busy: true, error: null, step: "Deposit: approving…" });
      try {
        const tx = await wallet
          .tx()
          .approve(token, fromAddress(config.poolContractAddress), amount)
          .send();
        await tx.wait();
      } catch (err) {
        set({ error: describe(err), step: null, busy: false });
        return;
      }
      set({ busy: false });

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
            amount.toBase()
          )
      );
    },

    transfer: (token, recipient, input) => {
      const wallet = useWalletStore.getState().wallet;
      if (!wallet) return Promise.resolve();

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
            .transfer({
              recipient: recipient.trim(),
              amount: Amount.parse(input, token).toBase(),
            })
            .surplusTo(wallet.address)
            .execute() as never
      );
    },

    withdraw: (token, input) => {
      const wallet = useWalletStore.getState().wallet;
      if (!wallet) return Promise.resolve();

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
            .withdraw({
              recipient: wallet.address,
              amount: Amount.parse(input, token).toBase(),
            })
            .surplusTo(wallet.address)
            .execute() as never
      );
    },

    /**
     * Whether a recipient can receive a private transfer yet. The SDK cannot
     * build a transfer to an account with no viewing key on-chain, so the UI
     * checks before offering the action.
     */
    recipientReady: async (recipient, token) => {
      const transfers = get().client;
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
    },
  };
});
