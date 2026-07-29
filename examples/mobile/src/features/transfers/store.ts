import { create } from "zustand";
import { Amount, fromAddress } from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import { feeOptions } from "@/core/settings";

export interface TransferItem {
  id: number;
  tokenAddress: string;
  to: string;
  amount: string;
}

interface TransfersStore {
  items: TransferItem[];
  submitting: boolean;
  addItem: (tokenAddress: string) => void;
  updateItem: (id: number, patch: Partial<Omit<TransferItem, "id">>) => void;
  removeItem: (id: number) => void;
  // Reset to a single blank row (called after a successful send).
  reset: (tokenAddress: string) => void;
  // Batch every complete row into a single atomic transaction.
  send: () => Promise<boolean>;
}

let seq = 0;
const newItem = (tokenAddress: string): TransferItem => ({
  id: ++seq,
  tokenAddress,
  to: "",
  amount: "",
});

const isComplete = (i: TransferItem) =>
  !!i.tokenAddress && !!i.to.trim() && !!i.amount.trim();

export const useTransfersStore = create<TransfersStore>((set, get) => ({
  items: [],
  submitting: false,
  addItem: (tokenAddress) =>
    set((s) => ({ items: [...s.items, newItem(tokenAddress)] })),
  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  reset: (tokenAddress) => set({ items: [newItem(tokenAddress)] }),
  send: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return false;
    const valid = get().items.filter(isComplete);
    if (!valid.length) return false;
    set({ submitting: true });
    // Chain each row onto one builder → a single atomic transaction.
    // fromAddress and Amount.parse validate each recipient and amount.
    const tx = await useTxBannerStore.getState().notify("Transfer", () => {
      const { tokens } = useTokensStore.getState();
      const builder = wallet.tx();
      for (const item of valid) {
        const token = tokens.find((t) => t.address === item.tokenAddress);
        if (!token) throw new Error("Unknown token in transfer.");
        builder.transfer(token, {
          to: fromAddress(item.to),
          amount: Amount.parse(item.amount, token),
        });
      }
      return builder.send(feeOptions());
    });
    set({ submitting: false });
    return !!tx;
  },
}));
