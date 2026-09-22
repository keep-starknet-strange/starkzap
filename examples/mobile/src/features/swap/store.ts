import { create } from "zustand";
import { Amount, type SwapQuote, type Token } from "starkzap-native";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import { friendlyPairError, type DryRunResult } from "@/core/errors";
import { feeOptions } from "@/core/settings";

const SLIPPAGE_BPS = 100n; // 1%

interface SwapStore {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  quote: SwapQuote | null;
  quoting: boolean;
  submitting: boolean;
  error: string | null;
  providerId: string;
  dryRunning: boolean;
  dryRunResult: DryRunResult | null;
  init: (tokenIn: string, tokenOut: string) => void;
  setTokenIn: (address: string) => void;
  setTokenOut: (address: string) => void;
  setAmountIn: (value: string) => void;
  setProvider: (id: string) => void;
  flip: () => void;
  fetchQuote: () => Promise<void>;
  // Simulate the swap without sending (SDK preflight).
  dryRun: () => Promise<void>;
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
  providerId: "ekubo",
  dryRunning: false,
  dryRunResult: null,
  init: (tokenIn, tokenOut) =>
    set((s) => ({
      tokenIn: s.tokenIn || tokenIn,
      tokenOut: s.tokenOut || tokenOut,
    })),
  setTokenIn: (address) =>
    set({ tokenIn: address, quote: null, dryRunResult: null }),
  setTokenOut: (address) =>
    set({ tokenOut: address, quote: null, dryRunResult: null }),
  setAmountIn: (value) =>
    set({ amountIn: value, quote: null, dryRunResult: null }),
  setProvider: (id) => set({ providerId: id, quote: null, dryRunResult: null }),
  flip: () =>
    set((s) => ({
      tokenIn: s.tokenOut,
      tokenOut: s.tokenIn,
      quote: null,
      dryRunResult: null,
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
        provider: get().providerId,
      });
      set({ quote });
    } catch (err) {
      const network = NETWORKS[useWalletStore.getState().networkIndex].name;
      set({ error: friendlyPairError(err, "Swap", network), quote: null });
    } finally {
      set({ quoting: false });
    }
  },
  dryRun: async () => {
    const { wallet } = useWalletStore.getState();
    const { inTok, outTok } = pair();
    const { amountIn } = get();
    if (!wallet || !inTok || !outTok || !amountIn.trim()) return;
    set({ dryRunning: true, dryRunResult: null });
    try {
      // prepareSwap builds the route calls without sending; preflight then
      // simulates them on-chain.
      const prepared = await wallet.prepareSwap({
        tokenIn: inTok,
        tokenOut: outTok,
        amountIn: Amount.parse(amountIn, inTok),
        slippageBps: SLIPPAGE_BPS,
        provider: get().providerId,
      });
      const result = await wallet.preflight({ calls: prepared.calls });
      set({
        dryRunResult: result.ok
          ? { ok: true, message: "Simulation passed — the swap would succeed." }
          : { ok: false, message: result.reason },
      });
    } catch (err) {
      const network = NETWORKS[useWalletStore.getState().networkIndex].name;
      set({
        dryRunResult: {
          ok: false,
          message: friendlyPairError(err, "Swap", network),
        },
      });
    } finally {
      set({ dryRunning: false });
    }
  },
  swap: async () => {
    const { wallet } = useWalletStore.getState();
    const { inTok, outTok } = pair();
    const { amountIn } = get();
    if (!wallet || !inTok || !outTok || !amountIn.trim()) return false;
    set({ submitting: true });
    const tx = await useTxBannerStore.getState().notify("Swap", () =>
      wallet.swap(
        {
          tokenIn: inTok,
          tokenOut: outTok,
          amountIn: Amount.parse(amountIn, inTok),
          slippageBps: SLIPPAGE_BPS,
          provider: get().providerId,
        },
        feeOptions()
      )
    );
    set({ submitting: false });
    return !!tx;
  },
}));
