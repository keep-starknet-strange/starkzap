import { create } from "zustand";
import { getPresets, type Token } from "starkzap-native";
import { NETWORKS } from "@/core/network";

// Default tokens tracked per network; any symbol absent from a network's
// presets is skipped.
const SYMBOLS = ["STRK", "ETH", "USDC", "USDT", "WBTC"];

function presetTokens(networkIndex: number): Token[] {
  const presets = getPresets(NETWORKS[networkIndex].chainId);
  return SYMBOLS.map((s) => presets[s]).filter((t): t is Token => !!t);
}

interface TokensStore {
  // The tokens shown across the app (balances, transfers, …).
  tokens: Token[];
  // Reseed the list with a network's default (preset) tokens.
  load: (networkIndex: number) => void;
  // Track an extra token; no-op if already tracked. (Future: user-added.)
  addToken: (token: Token) => void;
}

export const useTokensStore = create<TokensStore>((set, get) => ({
  tokens: presetTokens(0),
  load: (networkIndex) => set({ tokens: presetTokens(networkIndex) }),
  addToken: (token) => {
    if (get().tokens.some((t) => t.address === token.address)) return;
    set({ tokens: [...get().tokens, token] });
  },
}));
