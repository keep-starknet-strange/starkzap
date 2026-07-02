import { create } from "zustand";
import { Amount, fromAddress } from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";

export interface TransferItem {
  id: number;
  tokenAddress: string;
  to: string;
  amount: string;
}

interface TransfersStore {
  items: TransferItem[];
  submitting: boolean;
  error: string | null;
  lastTx: { hash: string; explorerUrl: string } | null;
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
  error: null,
  lastTx: null,
  addItem: (tokenAddress) =>
    set((s) => ({ items: [...s.items, newItem(tokenAddress)] })),
  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
  removeItem: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  reset: (tokenAddress) =>
    set({ items: [newItem(tokenAddress)], error: null, lastTx: null }),
  send: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return false;
    const valid = get().items.filter(isComplete);
    if (!valid.length) {
      set({ error: "Add at least one complete transfer." });
      return false;
    }
    set({ submitting: true, error: null, lastTx: null });
    try {
      const { tokens } = useTokensStore.getState();
      // Chain each row onto one builder → a single atomic transaction.
      // fromAddress and Amount.parse validate each recipient and amount.
      const builder = wallet.tx();
      for (const item of valid) {
        const token = tokens.find((t) => t.address === item.tokenAddress);
        if (!token) throw new Error("Unknown token in transfer.");
        builder.transfer(token, {
          to: fromAddress(item.to),
          amount: Amount.parse(item.amount, token),
        });
      }
      const tx = await builder.send();
      await tx.wait();
      set({ lastTx: { hash: tx.hash, explorerUrl: tx.explorerUrl } });
      return true;
    } catch (err) {
      set({ error: String(err) });
      return false;
    } finally {
      set({ submitting: false });
    }
  },
}));
