import { create } from "zustand";
import { Amount, type SwapQuote, type Token } from "starkzap-native";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";
import { useTxBannerStore } from "@/core/tx-banner/store";

const SLIPPAGE_BPS = 100n; // 1%

interface SwapStore {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  quote: SwapQuote | null;
  quoting: boolean;
  submitting: boolean;
  error: string | null;
  init: (tokenIn: string, tokenOut: string) => void;
  setTokenIn: (address: string) => void;
  setTokenOut: (address: string) => void;
  setAmountIn: (value: string) => void;
  flip: () => void;
  fetchQuote: () => Promise<void>;
  swap: () => Promise<boolean>;
}

function pair(): { inTok?: Token; outTok?: Token } {
  const { tokens } = useTokensStore.getState();
  const { tokenIn, tokenOut } = useSwapStore.getState();
  return {
    inTok: tokens.find((t) => t.address === tokenIn),
    outTok: tokens.find((t) => t.address === tokenOut),
  };
}

export const useSwapStore = create<SwapStore>((set, get) => ({
  tokenIn: "",
  tokenOut: "",
  amountIn: "",
  quote: null,
  quoting: false,
  submitting: false,
  error: null,
  init: (tokenIn, tokenOut) =>
    set((s) => ({
      tokenIn: s.tokenIn || tokenIn,
      tokenOut: s.tokenOut || tokenOut,
    })),
  setTokenIn: (address) => set({ tokenIn: address, quote: null }),
  setTokenOut: (address) => set({ tokenOut: address, quote: null }),
  setAmountIn: (value) => set({ amountIn: value, quote: null }),
  flip: () =>
    set((s) => ({
      tokenIn: s.tokenOut,
      tokenOut: s.tokenIn,
      quote: null,
    })),
  fetchQuote: async () => {
    const { wallet } = useWalletStore.getState();
    const { inTok, outTok } = pair();
    const { amountIn } = get();
    if (!wallet || !inTok || !outTok || !amountIn.trim()) {
      set({ quote: null });
      return;
    }
    set({ quoting: true, error: null });
    try {
      const quote = await wallet.getQuote({
        tokenIn: inTok,
        tokenOut: outTok,
        amountIn: Amount.parse(amountIn, inTok),
        slippageBps: SLIPPAGE_BPS,
      });
      set({ quote });
    } catch (err) {
      set({ error: String(err), quote: null });
    } finally {
      set({ quoting: false });
    }
  },
  swap: async () => {
    const { wallet } = useWalletStore.getState();
    const { inTok, outTok } = pair();
    const { amountIn } = get();
    if (!wallet || !inTok || !outTok || !amountIn.trim()) return false;
    set({ submitting: true });
    const tx = await useTxBannerStore.getState().notify("Swap", () =>
      wallet.swap({
        tokenIn: inTok,
        tokenOut: outTok,
        amountIn: Amount.parse(amountIn, inTok),
        slippageBps: SLIPPAGE_BPS,
      })
    );
    set({ submitting: false });
    return !!tx;
  },
}));
