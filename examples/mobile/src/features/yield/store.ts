import { create } from "zustand";
import {
  Amount,
  type TrovesStrategyAPIResult,
  type TrovesPosition,
} from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import type { DryRunResult } from "@/core/errors";

export function apyLabel(s: TrovesStrategyAPIResult): string {
  if (typeof s.apy === "number") return `${(s.apy * 100).toFixed(2)}% APY`;
  const numeric = s.apySplit.baseApy + s.apySplit.rewardsApy;
  return numeric > 0 ? `${(numeric * 100).toFixed(2)}% APY` : s.apy;
}

interface YieldStore {
  strategies: TrovesStrategyAPIResult[];
  loadingStrategies: boolean;
  // True when Troves is unavailable (it is a mainnet-only service).
  unsupported: boolean;
  strategyId: string;
  amount: string;
  submitting: boolean;
  dryRunning: boolean;
  dryRunResult: DryRunResult | null;
  // Positions for strategies the user has deposited into this session.
  positions: Record<string, TrovesPosition | null>;
  busyStrategy: string | null;

  loadStrategies: () => Promise<void>;
  refresh: () => Promise<void>;
  setStrategy: (id: string) => void;
  setAmount: (v: string) => void;
  deposit: () => Promise<void>;
  dryRun: () => Promise<void>;
  withdrawAll: (strategyId: string) => Promise<void>;
}

const strategyOf = (s: YieldStore, id: string) =>
  s.strategies.find((x) => x.id === id);

export const useYieldStore = create<YieldStore>((set, get) => ({
  strategies: [],
  loadingStrategies: false,
  unsupported: false,
  strategyId: "",
  amount: "",
  submitting: false,
  dryRunning: false,
  dryRunResult: null,
  positions: {},
  busyStrategy: null,

  loadStrategies: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ loadingStrategies: true, unsupported: false });
    try {
      // troves() throws on non-mainnet; getStrategies hits the Troves API.
      const { strategies } = await wallet.troves().getStrategies();
      const usable = strategies.filter(
        (s) => !s.isRetired && s.depositTokens.length === 1
      );
      set({
        strategies: usable,
        strategyId: get().strategyId || (usable[0]?.id ?? ""),
      });
    } catch {
      set({ strategies: [], unsupported: true });
    } finally {
      set({ loadingStrategies: false });
    }
    await get().refresh();
  },
  refresh: async () => {
    const { wallet } = useWalletStore.getState();
    const ids = Object.keys(get().positions);
    if (!wallet || ids.length === 0) return;
    try {
      const troves = wallet.troves();
      const entries = await Promise.all(
        ids.map(
          async (id) =>
            [id, await troves.getPosition(id).catch(() => null)] as const
        )
      );
      set({ positions: Object.fromEntries(entries) });
    } catch {
      // leave positions as-is
    }
  },
  setStrategy: (id) => set({ strategyId: id, dryRunResult: null }),
  setAmount: (v) => set({ amount: v, dryRunResult: null }),
  deposit: async () => {
    const { wallet } = useWalletStore.getState();
    const s = strategyOf(get(), get().strategyId);
    const { amount } = get();
    if (!wallet || !s || !amount.trim()) return;
    const token = s.depositTokens[0];
    if (!token) return;
    set({ submitting: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Deposit ${token.symbol}`, () =>
        wallet.troves().deposit({
          strategyId: s.id,
          amount: Amount.parse(amount, token.decimals, token.symbol),
        })
      );
    set({ submitting: false });
    if (tx) {
      set((st) => ({
        amount: "",
        positions: { ...st.positions, [s.id]: st.positions[s.id] ?? null },
      }));
      await get().refresh();
    }
  },
  dryRun: async () => {
    const { wallet } = useWalletStore.getState();
    const s = strategyOf(get(), get().strategyId);
    const { amount } = get();
    if (!wallet || !s || !amount.trim()) return;
    const token = s.depositTokens[0];
    if (!token) return;
    set({ dryRunning: true, dryRunResult: null });
    try {
      const calls = await wallet.troves().populateDeposit({
        strategyId: s.id,
        amount: Amount.parse(amount, token.decimals, token.symbol),
      });
      const result = await wallet.preflight({ calls });
      set({
        dryRunResult: result.ok
          ? {
              ok: true,
              message: "Simulation passed — the deposit would succeed.",
            }
          : { ok: false, message: result.reason },
      });
    } catch (err) {
      set({ dryRunResult: { ok: false, message: String(err) } });
    } finally {
      set({ dryRunning: false });
    }
  },
  withdrawAll: async (strategyId) => {
    const { wallet } = useWalletStore.getState();
    const pos = get().positions[strategyId];
    if (!wallet || !pos || !pos.amounts[0]) return;
    set({ busyStrategy: strategyId });
    const tx = await useTxBannerStore
      .getState()
      .notify("Withdraw", () =>
        wallet.troves().withdraw({ strategyId, amount: pos.amounts[0]! })
      );
    if (tx) await get().refresh();
    set({ busyStrategy: null });
  },
}));
