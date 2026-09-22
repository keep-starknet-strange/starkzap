import { writable, get } from "svelte/store";
import { Amount, type DcaOrder, type SwapQuote, type Token } from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { tokens } from "~/lib/stores/tokens";
import { feeOptions } from "~/lib/stores/settings";
import { log } from "~/lib/stores/logger";
import type { DryRunResult } from "~/features/swap/store";

// ISO 8601 durations understood by the DCA providers.
export const DCA_FREQUENCIES = [
  { value: "PT1H", label: "Hourly" },
  { value: "PT12H", label: "12 hours" },
  { value: "P1D", label: "Daily" },
  { value: "P1W", label: "Weekly" },
];

export const sellToken = writable("");
export const buyToken = writable("");
export const total = writable("");
export const cycle = writable("");
export const frequency = writable("P1D");
export const providerId = writable("ekubo");
export const preview = writable<SwapQuote | null>(null);
export const previewing = writable(false);
export const submitting = writable(false);
export const error = writable<string | null>(null);
export const dryRunning = writable(false);
export const dryRunResult = writable<DryRunResult | null>(null);
export const orders = writable<DcaOrder[]>([]);
export const cancellingId = writable<string | null>(null);

export function init(): void {
  const list = get(tokens);
  if (!get(sellToken) && list[0]) sellToken.set(list[0].address);
  if (!get(buyToken) && list[1]) buyToken.set(list[1].address);
}

function clearResults() {
  preview.set(null);
  dryRunResult.set(null);
}
export function setSellToken(a: string) {
  sellToken.set(a);
  clearResults();
}
export function setBuyToken(a: string) {
  buyToken.set(a);
  clearResults();
}
export function setProvider(id: string) {
  providerId.set(id);
  clearResults();
}
export function flip() {
  const a = get(sellToken);
  sellToken.set(get(buyToken));
  buyToken.set(a);
  clearResults();
}

function pair(): { sellTok?: Token; buyTok?: Token } {
  const list = get(tokens);
  return {
    sellTok: list.find((t) => t.address === get(sellToken)),
    buyTok: list.find((t) => t.address === get(buyToken)),
  };
}

export async function fetchPreview(): Promise<void> {
  const { wallet } = get(walletState);
  const { sellTok, buyTok } = pair();
  const perCycle = get(cycle);
  if (!wallet || !sellTok || !buyTok || !perCycle.trim()) {
    preview.set(null);
    return;
  }
  previewing.set(true);
  error.set(null);
  try {
    preview.set(
      await wallet.dca().previewCycle({
        sellToken: sellTok,
        buyToken: buyTok,
        sellAmountPerCycle: Amount.parse(perCycle, sellTok),
        swapProvider: get(providerId),
      })
    );
  } catch (err) {
    error.set(String(err));
    preview.set(null);
  } finally {
    previewing.set(false);
  }
}

export async function dryRun(): Promise<void> {
  const { wallet } = get(walletState);
  const { sellTok, buyTok } = pair();
  if (
    !wallet ||
    !sellTok ||
    !buyTok ||
    !get(total).trim() ||
    !get(cycle).trim()
  )
    return;
  dryRunning.set(true);
  dryRunResult.set(null);
  try {
    const prepared = await wallet.dca().prepareCreate({
      sellToken: sellTok,
      buyToken: buyTok,
      sellAmount: Amount.parse(get(total), sellTok),
      sellAmountPerCycle: Amount.parse(get(cycle), sellTok),
      frequency: get(frequency),
      provider: get(providerId),
    });
    const result = await wallet.preflight({ calls: prepared.calls });
    dryRunResult.set(
      result.ok
        ? {
            ok: true,
            message: "Simulation passed — the order would be created.",
          }
        : { ok: false, message: result.reason }
    );
  } catch (err) {
    dryRunResult.set({ ok: false, message: String(err) });
  } finally {
    dryRunning.set(false);
  }
}

export async function createOrder(): Promise<boolean> {
  const { wallet } = get(walletState);
  const { sellTok, buyTok } = pair();
  if (
    !wallet ||
    !sellTok ||
    !buyTok ||
    !get(total).trim() ||
    !get(cycle).trim()
  )
    return false;
  submitting.set(true);
  try {
    log("Creating DCA order…", "info");
    const tx = await wallet.dca().create(
      {
        sellToken: sellTok,
        buyToken: buyTok,
        sellAmount: Amount.parse(get(total), sellTok),
        sellAmountPerCycle: Amount.parse(get(cycle), sellTok),
        frequency: get(frequency),
        provider: get(providerId),
      },
      feeOptions()
    );
    await tx.wait();
    log("DCA order created", "success");
    total.set("");
    cycle.set("");
    clearResults();
    await loadOrders();
    return true;
  } catch (err) {
    log(`DCA create failed: ${err}`, "error");
    error.set(String(err));
    return false;
  } finally {
    submitting.set(false);
  }
}

export async function loadOrders(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  try {
    const page = await wallet
      .dca()
      .getOrders({ size: 20, provider: get(providerId) });
    orders.set(page.content);
  } catch (err) {
    error.set(String(err));
  }
}

export async function cancel(order: DcaOrder): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  cancellingId.set(order.id);
  try {
    const tx = await wallet
      .dca()
      .cancel(
        order.providerId === "ekubo"
          ? { orderId: order.id }
          : { orderAddress: order.orderAddress },
        feeOptions()
      );
    await tx.wait();
    await loadOrders();
  } catch (err) {
    log(`Cancel DCA failed: ${err}`, "error");
  } finally {
    cancellingId.set(null);
  }
}
