import { writable, get } from "svelte/store";
import { Amount, type SwapQuote, type Token } from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { tokens } from "~/lib/stores/tokens";
import { feeOptions } from "~/lib/stores/settings";
import { log } from "~/lib/stores/logger";

const SLIPPAGE_BPS = 100n; // 1%

export interface DryRunResult {
  ok: boolean;
  message: string;
}

export const tokenIn = writable("");
export const tokenOut = writable("");
export const amountIn = writable("");
export const providerId = writable("ekubo");
export const quote = writable<SwapQuote | null>(null);
export const quoting = writable(false);
export const submitting = writable(false);
export const error = writable<string | null>(null);
export const dryRunning = writable(false);
export const dryRunResult = writable<DryRunResult | null>(null);

// Seed the pair with the first two tracked tokens (once).
export function init(): void {
  const list = get(tokens);
  if (!get(tokenIn) && list[0]) tokenIn.set(list[0].address);
  if (!get(tokenOut) && list[1]) tokenOut.set(list[1].address);
}

function clearResults() {
  quote.set(null);
  dryRunResult.set(null);
}
export function setTokenIn(a: string) {
  tokenIn.set(a);
  clearResults();
}
export function setTokenOut(a: string) {
  tokenOut.set(a);
  clearResults();
}
export function setAmountIn(v: string) {
  amountIn.set(v);
  clearResults();
}
export function setProvider(id: string) {
  providerId.set(id);
  clearResults();
}
export function flip() {
  const a = get(tokenIn);
  tokenIn.set(get(tokenOut));
  tokenOut.set(a);
  clearResults();
}

function pair(): { inTok?: Token; outTok?: Token } {
  const list = get(tokens);
  return {
    inTok: list.find((t) => t.address === get(tokenIn)),
    outTok: list.find((t) => t.address === get(tokenOut)),
  };
}

export async function fetchQuote(): Promise<void> {
  const { wallet } = get(walletState);
  const { inTok, outTok } = pair();
  const amount = get(amountIn);
  if (!wallet || !inTok || !outTok || !amount.trim()) {
    quote.set(null);
    return;
  }
  quoting.set(true);
  error.set(null);
  try {
    quote.set(
      await wallet.getQuote({
        tokenIn: inTok,
        tokenOut: outTok,
        amountIn: Amount.parse(amount, inTok),
        slippageBps: SLIPPAGE_BPS,
        provider: get(providerId),
      })
    );
  } catch (err) {
    error.set(String(err));
    quote.set(null);
  } finally {
    quoting.set(false);
  }
}

// Simulate the swap without sending (SDK prepare + preflight).
export async function dryRun(): Promise<void> {
  const { wallet } = get(walletState);
  const { inTok, outTok } = pair();
  const amount = get(amountIn);
  if (!wallet || !inTok || !outTok || !amount.trim()) return;
  dryRunning.set(true);
  dryRunResult.set(null);
  try {
    const prepared = await wallet.prepareSwap({
      tokenIn: inTok,
      tokenOut: outTok,
      amountIn: Amount.parse(amount, inTok),
      slippageBps: SLIPPAGE_BPS,
      provider: get(providerId),
    });
    const result = await wallet.preflight({ calls: prepared.calls });
    dryRunResult.set(
      result.ok
        ? { ok: true, message: "Simulation passed — the swap would succeed." }
        : { ok: false, message: result.reason }
    );
  } catch (err) {
    dryRunResult.set({ ok: false, message: String(err) });
  } finally {
    dryRunning.set(false);
  }
}

export async function swap(): Promise<boolean> {
  const { wallet } = get(walletState);
  const { inTok, outTok } = pair();
  const amount = get(amountIn);
  if (!wallet || !inTok || !outTok || !amount.trim()) return false;
  submitting.set(true);
  try {
    log("Submitting swap…", "info");
    const tx = await wallet.swap(
      {
        tokenIn: inTok,
        tokenOut: outTok,
        amountIn: Amount.parse(amount, inTok),
        slippageBps: SLIPPAGE_BPS,
        provider: get(providerId),
      },
      feeOptions()
    );
    await tx.wait();
    log("Swap confirmed", "success");
    amountIn.set("");
    clearResults();
    return true;
  } catch (err) {
    log(`Swap failed: ${err}`, "error");
    error.set(String(err));
    return false;
  } finally {
    submitting.set(false);
  }
}
