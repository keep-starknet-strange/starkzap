import { writable, get } from "svelte/store";
import {
  Amount,
  type TrovesStrategyAPIResult,
  type TrovesPosition,
} from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";
import type { DryRunResult } from "~/features/swap/store";

export function apyLabel(s: TrovesStrategyAPIResult): string {
  if (typeof s.apy === "number") return `${(s.apy * 100).toFixed(2)}% APY`;
  const numeric = s.apySplit.baseApy + s.apySplit.rewardsApy;
  return numeric > 0 ? `${(numeric * 100).toFixed(2)}% APY` : s.apy;
}

export const strategies = writable<TrovesStrategyAPIResult[]>([]);
export const loadingStrategies = writable(false);
// True when Troves is unavailable (mainnet-only service).
export const unsupported = writable(false);
export const strategyId = writable("");
export const amount = writable("");
export const submitting = writable(false);
export const dryRunning = writable(false);
export const dryRunResult = writable<DryRunResult | null>(null);
export const positions = writable<Record<string, TrovesPosition | null>>({});
export const busyStrategy = writable<string | null>(null);

const strategyOf = (id: string) => get(strategies).find((x) => x.id === id);

export function setStrategy(id: string) {
  strategyId.set(id);
  dryRunResult.set(null);
}
export function setAmount(v: string) {
  amount.set(v);
  dryRunResult.set(null);
}

export async function loadStrategies(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  loadingStrategies.set(true);
  unsupported.set(false);
  try {
    // troves() throws on non-mainnet; getStrategies hits the Troves API.
    const { strategies: list } = await wallet.troves().getStrategies();
    const usable = list.filter(
      (s) => !s.isRetired && s.depositTokens.length === 1
    );
    strategies.set(usable);
    if (!get(strategyId)) strategyId.set(usable[0]?.id ?? "");
  } catch {
    strategies.set([]);
    unsupported.set(true);
  } finally {
    loadingStrategies.set(false);
  }
  await refresh();
}

export async function refresh(): Promise<void> {
  const { wallet } = get(walletState);
  const ids = Object.keys(get(positions));
  if (!wallet || ids.length === 0) return;
  try {
    const troves = wallet.troves();
    const entries = await Promise.all(
      ids.map(
        async (id) =>
          [id, await troves.getPosition(id).catch(() => null)] as const
      )
    );
    positions.set(Object.fromEntries(entries));
  } catch {
    // leave positions as-is
  }
}

export async function deposit(): Promise<void> {
  const { wallet } = get(walletState);
  const s = strategyOf(get(strategyId));
  const token = s?.depositTokens[0];
  if (!wallet || !s || !token || !get(amount).trim()) return;
  submitting.set(true);
  try {
    log(`Depositing ${token.symbol}…`, "info");
    const tx = await wallet.troves().deposit({
      strategyId: s.id,
      amount: Amount.parse(get(amount), token.decimals, token.symbol),
    });
    await tx.wait();
    log("Deposit confirmed", "success");
    amount.set("");
    positions.update((p) => ({ ...p, [s.id]: p[s.id] ?? null }));
    await refresh();
  } catch (err) {
    log(`Deposit failed: ${err}`, "error");
  } finally {
    submitting.set(false);
  }
}

export async function dryRun(): Promise<void> {
  const { wallet } = get(walletState);
  const s = strategyOf(get(strategyId));
  const token = s?.depositTokens[0];
  if (!wallet || !s || !token || !get(amount).trim()) return;
  dryRunning.set(true);
  dryRunResult.set(null);
  try {
    const calls = await wallet.troves().populateDeposit({
      strategyId: s.id,
      amount: Amount.parse(get(amount), token.decimals, token.symbol),
    });
    const result = await wallet.preflight({ calls });
    dryRunResult.set(
      result.ok
        ? {
            ok: true,
            message: "Simulation passed — the deposit would succeed.",
          }
        : { ok: false, message: result.reason }
    );
  } catch (err) {
    dryRunResult.set({ ok: false, message: String(err) });
  } finally {
    dryRunning.set(false);
  }
}

export async function withdrawAll(id: string): Promise<void> {
  const { wallet } = get(walletState);
  const pos = get(positions)[id];
  if (!wallet || !pos || !pos.amounts[0]) return;
  busyStrategy.set(id);
  try {
    log("Withdrawing…", "info");
    const tx = await wallet
      .troves()
      .withdraw({ strategyId: id, amount: pos.amounts[0]! });
    await tx.wait();
    await refresh();
  } catch (err) {
    log(`Withdraw failed: ${err}`, "error");
  } finally {
    busyStrategy.set(null);
  }
}
