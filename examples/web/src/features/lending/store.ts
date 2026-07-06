import { writable, get } from "svelte/store";
import {
  Amount,
  type LendingMarket,
  type LendingHealth,
  type LendingUserPosition,
} from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { feeOptions } from "~/lib/stores/settings";
import { log } from "~/lib/stores/logger";
import type { DryRunResult } from "~/features/swap/store";

const USD_SCALE = 10n ** 18n;
// USD values come as integers on a 1e18 scale.
export function formatUsd18(value?: bigint | null): string {
  if (value == null) return "—";
  const dollars = value / USD_SCALE;
  const cents = ((value % USD_SCALE) * 100n) / USD_SCALE;
  return `$${dollars.toString()}.${cents.toString().padStart(2, "0")}`;
}

export const marketId = (m: LendingMarket) =>
  `${m.poolAddress}:${m.asset.address}`;

export const markets = writable<LendingMarket[]>([]);
export const loadingMarkets = writable(false);
export const positions = writable<LendingUserPosition[]>([]);

// Earn form
export const earnMarketId = writable("");
export const earnAmount = writable("");
export const earnSubmitting = writable(false);
export const earnDryRunning = writable(false);
export const earnDryRunResult = writable<DryRunResult | null>(null);

// Borrow form
export const collateralId = writable("");
export const debtId = writable("");
export const collateralAmount = writable("");
export const borrowAmount = writable("");
export const health = writable<LendingHealth | null>(null);
export const borrowSubmitting = writable(false);
export const borrowDryRunning = writable(false);
export const borrowDryRunResult = writable<DryRunResult | null>(null);

export const busyPosition = writable<string | null>(null);

const find = (id: string) => get(markets).find((m) => marketId(m) === id);

export async function loadMarkets(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  loadingMarkets.set(true);
  try {
    const list = await wallet.lending().getMarkets({});
    markets.set(list);
    if (!get(earnMarketId) && list[0]) earnMarketId.set(marketId(list[0]));
  } catch {
    markets.set([]);
  } finally {
    loadingMarkets.set(false);
  }
  await refresh();
}

export async function refresh(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  try {
    positions.set(await wallet.lending().getPositions());
  } catch {
    positions.set([]);
  }
}

// ---- Earn ----
export function setEarnMarket(id: string) {
  earnMarketId.set(id);
  earnDryRunResult.set(null);
}
export function setEarnAmount(v: string) {
  earnAmount.set(v);
  earnDryRunResult.set(null);
}

export async function deposit(): Promise<void> {
  const { wallet } = get(walletState);
  const m = find(get(earnMarketId));
  if (!wallet || !m || !get(earnAmount).trim()) return;
  earnSubmitting.set(true);
  try {
    log(`Depositing ${m.asset.symbol}…`, "info");
    const tx = await wallet.lending().deposit(
      {
        token: m.asset,
        amount: Amount.parse(get(earnAmount), m.asset),
        poolAddress: m.poolAddress,
      },
      feeOptions()
    );
    await tx.wait();
    log("Deposit confirmed", "success");
    earnAmount.set("");
    await refresh();
  } catch (err) {
    log(`Deposit failed: ${err}`, "error");
  } finally {
    earnSubmitting.set(false);
  }
}

export async function earnDryRun(): Promise<void> {
  const { wallet } = get(walletState);
  const m = find(get(earnMarketId));
  if (!wallet || !m || !get(earnAmount).trim()) return;
  earnDryRunning.set(true);
  earnDryRunResult.set(null);
  try {
    const prepared = await wallet.lending().prepareDeposit({
      token: m.asset,
      amount: Amount.parse(get(earnAmount), m.asset),
      poolAddress: m.poolAddress,
    });
    const result = await wallet.preflight({ calls: prepared.calls });
    earnDryRunResult.set(
      result.ok
        ? {
            ok: true,
            message: "Simulation passed — the deposit would succeed.",
          }
        : { ok: false, message: result.reason }
    );
  } catch (err) {
    earnDryRunResult.set({ ok: false, message: String(err) });
  } finally {
    earnDryRunning.set(false);
  }
}

export async function withdrawPosition(p: LendingUserPosition): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  busyPosition.set(p.pool.id);
  try {
    log(`Withdrawing ${p.collateral.token.symbol}…`, "info");
    const tx = await wallet
      .lending()
      .withdrawMax(
        { token: p.collateral.token, poolAddress: p.pool.id },
        feeOptions()
      );
    await tx.wait();
    await refresh();
  } catch (err) {
    log(`Withdraw failed: ${err}`, "error");
  } finally {
    busyPosition.set(null);
  }
}

// ---- Borrow ----
export function setCollateral(id: string) {
  collateralId.set(id);
  health.set(null);
  borrowDryRunResult.set(null);
}
export function setDebt(id: string) {
  debtId.set(id);
  health.set(null);
  borrowDryRunResult.set(null);
}
export function setCollateralAmount(v: string) {
  collateralAmount.set(v);
  borrowDryRunResult.set(null);
}
export function setBorrowAmount(v: string) {
  borrowAmount.set(v);
  borrowDryRunResult.set(null);
}

export async function refreshHealth(): Promise<void> {
  const { wallet } = get(walletState);
  const c = find(get(collateralId));
  const d = find(get(debtId));
  if (!wallet || !c || !d) {
    health.set(null);
    return;
  }
  try {
    health.set(
      await wallet.lending().getHealth({
        collateralToken: c.asset,
        debtToken: d.asset,
        poolAddress: c.poolAddress,
      })
    );
  } catch {
    health.set(null);
  }
}

export async function borrow(): Promise<void> {
  const { wallet } = get(walletState);
  const c = find(get(collateralId));
  const d = find(get(debtId));
  if (
    !wallet ||
    !c ||
    !d ||
    !get(collateralAmount).trim() ||
    !get(borrowAmount).trim()
  )
    return;
  borrowSubmitting.set(true);
  try {
    log(`Borrowing ${d.asset.symbol}…`, "info");
    const tx = await wallet.lending().borrow(
      {
        collateralToken: c.asset,
        debtToken: d.asset,
        collateralAmount: Amount.parse(get(collateralAmount), c.asset),
        amount: Amount.parse(get(borrowAmount), d.asset),
        poolAddress: c.poolAddress,
      },
      feeOptions()
    );
    await tx.wait();
    log("Borrow confirmed", "success");
    collateralAmount.set("");
    borrowAmount.set("");
    await refresh();
  } catch (err) {
    log(`Borrow failed: ${err}`, "error");
  } finally {
    borrowSubmitting.set(false);
  }
}

export async function borrowDryRun(): Promise<void> {
  const { wallet } = get(walletState);
  const c = find(get(collateralId));
  const d = find(get(debtId));
  if (
    !wallet ||
    !c ||
    !d ||
    !get(collateralAmount).trim() ||
    !get(borrowAmount).trim()
  )
    return;
  borrowDryRunning.set(true);
  borrowDryRunResult.set(null);
  try {
    const prepared = await wallet.lending().prepareBorrow({
      collateralToken: c.asset,
      debtToken: d.asset,
      collateralAmount: Amount.parse(get(collateralAmount), c.asset),
      amount: Amount.parse(get(borrowAmount), d.asset),
      poolAddress: c.poolAddress,
    });
    const result = await wallet.preflight({ calls: prepared.calls });
    borrowDryRunResult.set(
      result.ok
        ? { ok: true, message: "Simulation passed — the borrow would succeed." }
        : { ok: false, message: result.reason }
    );
  } catch (err) {
    borrowDryRunResult.set({ ok: false, message: String(err) });
  } finally {
    borrowDryRunning.set(false);
  }
}

export async function repayPosition(p: LendingUserPosition): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet || !p.debt) return;
  busyPosition.set(p.pool.id);
  try {
    log(`Repaying ${p.debt.token.symbol}…`, "info");
    const tx = await wallet.lending().repay(
      {
        collateralToken: p.collateral.token,
        debtToken: p.debt.token,
        amount: Amount.fromRaw(p.debt.amount, p.debt.token),
        poolAddress: p.pool.id,
        withdrawCollateral: true,
      },
      feeOptions()
    );
    await tx.wait();
    await refresh();
  } catch (err) {
    log(`Repay failed: ${err}`, "error");
  } finally {
    busyPosition.set(null);
  }
}
