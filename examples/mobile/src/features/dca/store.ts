import { create } from "zustand";
import {
  Amount,
  type DcaOrder,
  type SwapQuote,
  type Token,
} from "starkzap-native";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import { friendlyPairError, type DryRunResult } from "@/core/errors";
import { feeOptions } from "@/core/settings";

// ISO 8601 durations understood by the DCA providers.
export const DCA_FREQUENCIES = [
  { value: "PT1H", label: "Hourly" },
  { value: "PT12H", label: "12 hours" },
  { value: "P1D", label: "Daily" },
  { value: "P1W", label: "Weekly" },
];

interface DcaStore {
  sellToken: string;
  buyToken: string;
  total: string;
  cycle: string;
  frequency: string;
  preview: SwapQuote | null;
  previewing: boolean;
  submitting: boolean;
  error: string | null;
  dryRunning: boolean;
  dryRunResult: DryRunResult | null;
  orders: DcaOrder[];
  loadingOrders: boolean;
  cancellingId: string | null;
  providerId: string;
  init: (sell: string, buy: string) => void;
  setSellToken: (address: string) => void;
  setBuyToken: (address: string) => void;
  setTotal: (value: string) => void;
  setCycle: (value: string) => void;
  setFrequency: (value: string) => void;
  setProvider: (id: string) => void;
  flip: () => void;
  fetchPreview: () => Promise<void>;
  // Simulate creating the order without sending (SDK preflight).
  dryRun: () => Promise<void>;
  createOrder: () => Promise<boolean>;
  loadOrders: () => Promise<void>;
  cancel: (order: DcaOrder) => Promise<void>;
}

function pair(): { sellTok?: Token; buyTok?: Token } {
  const { tokens } = useTokensStore.getState();
  const { sellToken, buyToken } = useDcaStore.getState();
  return {
    sellTok: tokens.find((t) => t.address === sellToken),
    buyTok: tokens.find((t) => t.address === buyToken),
  };
}

export const useDcaStore = create<DcaStore>((set, get) => ({
  sellToken: "",
  buyToken: "",
  total: "",
  cycle: "",
  frequency: "P1D",
  preview: null,
  previewing: false,
  submitting: false,
  error: null,
  dryRunning: false,
  dryRunResult: null,
  orders: [],
  loadingOrders: false,
  cancellingId: null,
  providerId: "ekubo",
  init: (sell, buy) =>
    set((s) => ({
      sellToken: s.sellToken || sell,
      buyToken: s.buyToken || buy,
    })),
  setSellToken: (address) =>
    set({ sellToken: address, preview: null, dryRunResult: null }),
  setBuyToken: (address) =>
    set({ buyToken: address, preview: null, dryRunResult: null }),
  setTotal: (value) => set({ total: value, dryRunResult: null }),
  setCycle: (value) => set({ cycle: value, preview: null, dryRunResult: null }),
  setFrequency: (value) => set({ frequency: value, dryRunResult: null }),
  setProvider: (id) =>
    set({ providerId: id, preview: null, dryRunResult: null }),
  flip: () =>
    set((s) => ({
      sellToken: s.buyToken,
      buyToken: s.sellToken,
      preview: null,
      dryRunResult: null,
    })),
  fetchPreview: async () => {
    const { wallet } = useWalletStore.getState();
    const { sellTok, buyTok } = pair();
    const { cycle } = get();
    if (!wallet || !sellTok || !buyTok || !cycle.trim()) {
      set({ preview: null });
      return;
    }
    set({ previewing: true, error: null });
    try {
      const preview = await wallet.dca().previewCycle({
        sellToken: sellTok,
        buyToken: buyTok,
        sellAmountPerCycle: Amount.parse(cycle, sellTok),
        swapProvider: get().providerId,
      });
      set({ preview });
    } catch (err) {
      const network = NETWORKS[useWalletStore.getState().networkIndex].name;
      set({ error: friendlyPairError(err, "DCA", network), preview: null });
    } finally {
      set({ previewing: false });
    }
  },
  dryRun: async () => {
    const { wallet } = useWalletStore.getState();
    const { sellTok, buyTok } = pair();
    const { total, cycle, frequency } = get();
    if (!wallet || !sellTok || !buyTok || !total.trim() || !cycle.trim())
      return;
    set({ dryRunning: true, dryRunResult: null });
    try {
      // prepareCreate builds the calls (resolving the TWAMM pool) without
      // sending; preflight then simulates them on-chain.
      const prepared = await wallet.dca().prepareCreate({
        sellToken: sellTok,
        buyToken: buyTok,
        sellAmount: Amount.parse(total, sellTok),
        sellAmountPerCycle: Amount.parse(cycle, sellTok),
        frequency,
        provider: get().providerId,
      });
      const result = await wallet.preflight({ calls: prepared.calls });
      set({
        dryRunResult: result.ok
          ? {
              ok: true,
              message: "Simulation passed — the order would be created.",
            }
          : { ok: false, message: result.reason },
      });
    } catch (err) {
      const network = NETWORKS[useWalletStore.getState().networkIndex].name;
      set({
        dryRunResult: {
          ok: false,
          message: friendlyPairError(err, "DCA", network),
        },
      });
    } finally {
      set({ dryRunning: false });
    }
  },
  createOrder: async () => {
    const { wallet } = useWalletStore.getState();
    const { sellTok, buyTok } = pair();
    const { total, cycle, frequency } = get();
    if (!wallet || !sellTok || !buyTok || !total.trim() || !cycle.trim())
      return false;
    set({ submitting: true });
    const tx = await useTxBannerStore.getState().notify("DCA order", () =>
      wallet.dca().create(
        {
          sellToken: sellTok,
          buyToken: buyTok,
          sellAmount: Amount.parse(total, sellTok),
          sellAmountPerCycle: Amount.parse(cycle, sellTok),
          frequency,
          provider: get().providerId,
        },
        feeOptions()
      )
    );
    set({ submitting: false });
    if (tx) await get().loadOrders();
    return !!tx;
  },
  loadOrders: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ loadingOrders: true });
    try {
      const page = await wallet
        .dca()
        .getOrders({ size: 20, provider: get().providerId });
      set({ orders: page.content });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loadingOrders: false });
    }
  },
  cancel: async (order) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ cancellingId: order.id });
    const tx = await useTxBannerStore
      .getState()
      .notify("Cancel DCA", () =>
        wallet
          .dca()
          .cancel(
            order.providerId === "ekubo"
              ? { orderId: order.id }
              : { orderAddress: order.orderAddress },
            feeOptions()
          )
      );
    if (tx) await get().loadOrders();
    set({ cancellingId: null });
  },
}));
