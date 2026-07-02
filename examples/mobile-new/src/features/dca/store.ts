import { create } from "zustand";
import {
  Amount,
  type DcaOrder,
  type SwapQuote,
  type Token,
} from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";

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
  lastTx: { hash: string; explorerUrl: string } | null;
  orders: DcaOrder[];
  loadingOrders: boolean;
  cancellingId: string | null;
  init: (sell: string, buy: string) => void;
  setSellToken: (address: string) => void;
  setBuyToken: (address: string) => void;
  setTotal: (value: string) => void;
  setCycle: (value: string) => void;
  setFrequency: (value: string) => void;
  flip: () => void;
  fetchPreview: () => Promise<void>;
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
  lastTx: null,
  orders: [],
  loadingOrders: false,
  cancellingId: null,
  init: (sell, buy) =>
    set((s) => ({
      sellToken: s.sellToken || sell,
      buyToken: s.buyToken || buy,
    })),
  setSellToken: (address) => set({ sellToken: address, preview: null }),
  setBuyToken: (address) => set({ buyToken: address, preview: null }),
  setTotal: (value) => set({ total: value }),
  setCycle: (value) => set({ cycle: value, preview: null }),
  setFrequency: (value) => set({ frequency: value }),
  flip: () =>
    set((s) => ({
      sellToken: s.buyToken,
      buyToken: s.sellToken,
      preview: null,
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
      });
      set({ preview });
    } catch (err) {
      set({ error: String(err), preview: null });
    } finally {
      set({ previewing: false });
    }
  },
  createOrder: async () => {
    const { wallet } = useWalletStore.getState();
    const { sellTok, buyTok } = pair();
    const { total, cycle, frequency } = get();
    if (!wallet || !sellTok || !buyTok || !total.trim() || !cycle.trim())
      return false;
    set({ submitting: true, error: null, lastTx: null });
    try {
      const tx = await wallet.dca().create({
        sellToken: sellTok,
        buyToken: buyTok,
        sellAmount: Amount.parse(total, sellTok),
        sellAmountPerCycle: Amount.parse(cycle, sellTok),
        frequency,
      });
      await tx.wait();
      set({ lastTx: { hash: tx.hash, explorerUrl: tx.explorerUrl } });
      await get().loadOrders();
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    } finally {
      set({ submitting: false });
    }
  },
  loadOrders: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ loadingOrders: true });
    try {
      const page = await wallet.dca().getOrders({ size: 20 });
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
    set({ cancellingId: order.id, error: null });
    try {
      const tx = await wallet
        .dca()
        .cancel(
          order.providerId === "ekubo"
            ? { orderId: order.id }
            : { orderAddress: order.orderAddress }
        );
      await tx.wait();
      await get().loadOrders();
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ cancellingId: null });
    }
  },
}));
