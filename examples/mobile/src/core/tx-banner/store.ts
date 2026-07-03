import { create } from "zustand";
import type { Tx } from "starkzap-native";

export type TxStatus = "pending" | "success" | "failed";

export interface TxNotification {
  id: number;
  status: TxStatus;
  title: string;
  explorerUrl?: string;
  error?: string;
}

interface TxBannerStore {
  current: TxNotification | null;
  // Run a wallet transaction, driving the banner through pending → success/
  // failed. `exec` returns the sent Tx (before confirmation); wait happens here.
  // Resolves to the Tx on success, or null on failure.
  notify: (title: string, exec: () => Promise<Tx>) => Promise<Tx | null>;
  dismiss: () => void;
}

let seq = 0;

export const useTxBannerStore = create<TxBannerStore>((set) => ({
  current: null,
  dismiss: () => set({ current: null }),
  notify: async (title, exec) => {
    const id = ++seq;
    set({ current: { id, status: "pending", title } });
    try {
      const tx = await exec();
      set({
        current: { id, status: "pending", title, explorerUrl: tx.explorerUrl },
      });
      await tx.wait();
      set({
        current: { id, status: "success", title, explorerUrl: tx.explorerUrl },
      });
      return tx;
    } catch (err) {
      set({ current: { id, status: "failed", title, error: String(err) } });
      return null;
    }
  },
}));
