import { create } from "zustand";
import { getPresets, type Amount, type Token } from "starkzap-native";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";

// Common tokens to show; any absent from the network's presets are skipped.
const SYMBOLS = ["STRK", "ETH", "USDC", "USDT", "WBTC"];

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
    const { wallet, networkIndex } = useWalletStore.getState();
    if (!wallet) return;
    set({ loading: true, error: null });
    try {
      const presets = getPresets(NETWORKS[networkIndex].chainId);
      const tokens = SYMBOLS.map((s) => presets[s]).filter(
        (t): t is Token => !!t
      );
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
