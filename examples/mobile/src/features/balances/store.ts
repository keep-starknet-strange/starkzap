import { create } from "zustand";
import { type Amount, type Token } from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";

export interface TokenBalance {
  token: Token;
  amount: Amount;
}

interface BalancesStore {
  balances: TokenBalance[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useBalancesStore = create<BalancesStore>((set) => ({
  balances: [],
  loading: false,
  error: null,
  refresh: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ loading: true, error: null });
    try {
      const { tokens } = useTokensStore.getState();
      const balances = await Promise.all(
        tokens.map(async (token) => ({
          token,
          amount: await wallet.balanceOf(token),
        }))
      );
      set({ balances });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },
}));
