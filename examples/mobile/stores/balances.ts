import { create } from "zustand";
import {
  sepoliaTokens,
  mainnetTokens,
  type Token,
  type Amount,
  type ChainId,
  type WalletInterface,
} from "x";

export function getTokensForNetwork(chainId: ChainId): Token[] {
  return chainId.isSepolia()
    ? Object.values(sepoliaTokens)
    : Object.values(mainnetTokens);
}

export function getStrkToken(chainId: ChainId): Token {
  return chainId.isSepolia() ? sepoliaTokens.STRK : mainnetTokens.STRK;
}

interface BalancesState {
  balances: Map<string, Amount>;
  isLoading: boolean;
  lastUpdated: Date | null;

  fetchBalances: (wallet: WalletInterface, chainId: ChainId) => Promise<void>;
  getBalance: (token: Token) => Amount | null;
  clearBalances: () => void;
}

export const useBalancesStore = create<BalancesState>((set, get) => ({
  balances: new Map(),
  isLoading: false,
  lastUpdated: null,

  fetchBalances: async (wallet, chainId) => {
    set({ isLoading: true });

    const tokens = getTokensForNetwork(chainId);
    const newBalances = new Map<string, Amount>();

    try {
      // Fetch all balances in parallel using wallet's balanceOf method
      const balancePromises = tokens.map(async (token) => {
        try {
          const balance = await wallet.balanceOf(token);
          return { address: token.address, balance };
        } catch (error) {
          console.error(`Failed to fetch balance for ${token.symbol}:`, error);
          return null;
        }
      });

      const results = await Promise.all(balancePromises);

      results.forEach((result) => {
        if (result) {
          newBalances.set(result.address, result.balance);
        }
      });

      set({
        balances: newBalances,
        isLoading: false,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      set({ isLoading: false });
    }
  },

  getBalance: (token) => {
    return get().balances.get(token.address) ?? null;
  },

  clearBalances: () => {
    set({
      balances: new Map(),
      lastUpdated: null,
    });
  },
}));
