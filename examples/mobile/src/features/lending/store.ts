import { create } from "zustand";
import {
  Amount,
  type LendingMarket,
  type LendingHealth,
  type LendingUserPosition,
} from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import type { DryRunResult } from "@/core/errors";

const USD_SCALE = 10n ** 18n;
// USD values come as integers on a 1e18 scale.
export function formatUsd18(value?: bigint | null): string {
  if (value == null) return "—";
  const dollars = value / USD_SCALE;
  const cents = ((value % USD_SCALE) * 100n) / USD_SCALE;
  return `$${dollars.toString()}.${cents.toString().padStart(2, "0")}`;
}

export const marketId = (m: LendingMarket) =>
  `${m.poolAddress}:${m.asset.address}`;

interface LendingStore {
  markets: LendingMarket[];
  loadingMarkets: boolean;
  positions: LendingUserPosition[];

  // Earn form
  earnMarketId: string;
  earnAmount: string;
  earnSubmitting: boolean;
  earnDryRunning: boolean;
  earnDryRunResult: DryRunResult | null;

  // Borrow form
  collateralId: string;
  debtId: string;
  collateralAmount: string;
  borrowAmount: string;
  health: LendingHealth | null;
  borrowSubmitting: boolean;
  borrowDryRunning: boolean;
  borrowDryRunResult: DryRunResult | null;

  busyPosition: string | null;

  loadMarkets: () => Promise<void>;
  refresh: () => Promise<void>;
  setEarnMarket: (id: string) => void;
  setEarnAmount: (v: string) => void;
  deposit: () => Promise<void>;
  earnDryRun: () => Promise<void>;
  withdrawPosition: (p: LendingUserPosition) => Promise<void>;
  setCollateral: (id: string) => void;
  setDebt: (id: string) => void;
  setCollateralAmount: (v: string) => void;
  setBorrowAmount: (v: string) => void;
  refreshHealth: () => Promise<void>;
  borrow: () => Promise<void>;
  borrowDryRun: () => Promise<void>;
  repayPosition: (p: LendingUserPosition) => Promise<void>;
}

const find = (markets: LendingMarket[], id: string) =>
  markets.find((m) => marketId(m) === id);

export const useLendingStore = create<LendingStore>((set, get) => ({
  markets: [],
  loadingMarkets: false,
  positions: [],
  earnMarketId: "",
  earnAmount: "",
  earnSubmitting: false,
  earnDryRunning: false,
  earnDryRunResult: null,
  collateralId: "",
  debtId: "",
  collateralAmount: "",
  borrowAmount: "",
  health: null,
  borrowSubmitting: false,
  borrowDryRunning: false,
  borrowDryRunResult: null,
  busyPosition: null,

  loadMarkets: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ loadingMarkets: true });
    try {
      const markets = await wallet.lending().getMarkets({});
      set({
        markets,
        earnMarketId:
          get().earnMarketId || (markets[0] ? marketId(markets[0]) : ""),
      });
    } catch {
      set({ markets: [] });
    } finally {
      set({ loadingMarkets: false });
    }
    await get().refresh();
  },
  refresh: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    try {
      const positions = await wallet.lending().getPositions();
      set({ positions });
    } catch {
      set({ positions: [] });
    }
  },

  // ---- Earn ----
  setEarnMarket: (id) => set({ earnMarketId: id, earnDryRunResult: null }),
  setEarnAmount: (v) => set({ earnAmount: v, earnDryRunResult: null }),
  deposit: async () => {
    const { wallet } = useWalletStore.getState();
    const m = find(get().markets, get().earnMarketId);
    const { earnAmount } = get();
    if (!wallet || !m || !earnAmount.trim()) return;
    set({ earnSubmitting: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Deposit ${m.asset.symbol}`, () =>
        wallet.lending().deposit({
          token: m.asset,
          amount: Amount.parse(earnAmount, m.asset),
          poolAddress: m.poolAddress,
        })
      );
    set({ earnSubmitting: false });
    if (tx) {
      set({ earnAmount: "" });
      await get().refresh();
    }
  },
  earnDryRun: async () => {
    const { wallet } = useWalletStore.getState();
    const m = find(get().markets, get().earnMarketId);
    const { earnAmount } = get();
    if (!wallet || !m || !earnAmount.trim()) return;
    set({ earnDryRunning: true, earnDryRunResult: null });
    try {
      const prepared = await wallet.lending().prepareDeposit({
        token: m.asset,
        amount: Amount.parse(earnAmount, m.asset),
        poolAddress: m.poolAddress,
      });
      const result = await wallet.preflight({ calls: prepared.calls });
      set({
        earnDryRunResult: result.ok
          ? {
              ok: true,
              message: "Simulation passed — the deposit would succeed.",
            }
          : { ok: false, message: result.reason },
      });
    } catch (err) {
      set({ earnDryRunResult: { ok: false, message: String(err) } });
    } finally {
      set({ earnDryRunning: false });
    }
  },
  withdrawPosition: async (p) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ busyPosition: p.pool.id });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Withdraw ${p.collateral.token.symbol}`, () =>
        wallet.lending().withdrawMax({
          token: p.collateral.token,
          poolAddress: p.pool.id,
        })
      );
    if (tx) await get().refresh();
    set({ busyPosition: null });
  },

  // ---- Borrow ----
  setCollateral: (id) =>
    set({ collateralId: id, health: null, borrowDryRunResult: null }),
  setDebt: (id) => set({ debtId: id, health: null, borrowDryRunResult: null }),
  setCollateralAmount: (v) =>
    set({ collateralAmount: v, borrowDryRunResult: null }),
  setBorrowAmount: (v) => set({ borrowAmount: v, borrowDryRunResult: null }),
  refreshHealth: async () => {
    const { wallet } = useWalletStore.getState();
    const c = find(get().markets, get().collateralId);
    const d = find(get().markets, get().debtId);
    if (!wallet || !c || !d) {
      set({ health: null });
      return;
    }
    try {
      const health = await wallet.lending().getHealth({
        collateralToken: c.asset,
        debtToken: d.asset,
        poolAddress: c.poolAddress,
      });
      set({ health });
    } catch {
      set({ health: null });
    }
  },
  borrow: async () => {
    const { wallet } = useWalletStore.getState();
    const c = find(get().markets, get().collateralId);
    const d = find(get().markets, get().debtId);
    const { collateralAmount, borrowAmount } = get();
    if (!wallet || !c || !d || !collateralAmount.trim() || !borrowAmount.trim())
      return;
    set({ borrowSubmitting: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Borrow ${d.asset.symbol}`, () =>
        wallet.lending().borrow({
          collateralToken: c.asset,
          debtToken: d.asset,
          collateralAmount: Amount.parse(collateralAmount, c.asset),
          amount: Amount.parse(borrowAmount, d.asset),
          poolAddress: c.poolAddress,
        })
      );
    set({ borrowSubmitting: false });
    if (tx) {
      set({ collateralAmount: "", borrowAmount: "" });
      await get().refresh();
    }
  },
  borrowDryRun: async () => {
    const { wallet } = useWalletStore.getState();
    const c = find(get().markets, get().collateralId);
    const d = find(get().markets, get().debtId);
    const { collateralAmount, borrowAmount } = get();
    if (!wallet || !c || !d || !collateralAmount.trim() || !borrowAmount.trim())
      return;
    set({ borrowDryRunning: true, borrowDryRunResult: null });
    try {
      const prepared = await wallet.lending().prepareBorrow({
        collateralToken: c.asset,
        debtToken: d.asset,
        collateralAmount: Amount.parse(collateralAmount, c.asset),
        amount: Amount.parse(borrowAmount, d.asset),
        poolAddress: c.poolAddress,
      });
      const result = await wallet.preflight({ calls: prepared.calls });
      set({
        borrowDryRunResult: result.ok
          ? {
              ok: true,
              message: "Simulation passed — the borrow would succeed.",
            }
          : { ok: false, message: result.reason },
      });
    } catch (err) {
      set({ borrowDryRunResult: { ok: false, message: String(err) } });
    } finally {
      set({ borrowDryRunning: false });
    }
  },
  repayPosition: async (p) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet || !p.debt) return;
    set({ busyPosition: p.pool.id });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Repay ${p.debt.token.symbol}`, () =>
        wallet.lending().repay({
          collateralToken: p.collateral.token,
          debtToken: p.debt!.token,
          amount: Amount.fromRaw(p.debt!.amount, p.debt!.token),
          poolAddress: p.pool.id,
          withdrawCollateral: true,
        })
      );
    if (tx) await get().refresh();
    set({ busyPosition: null });
  },
}));
