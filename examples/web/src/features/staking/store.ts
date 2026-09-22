import { writable, get } from "svelte/store";
import {
  Amount,
  mainnetValidators,
  sepoliaValidators,
  type Pool,
  type PoolMember,
  type Validator,
} from "starkzap";
import { CHAIN_ID } from "~/lib/stores/config";
import { walletState, sdk } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";
import type { DryRunResult } from "~/features/swap/store";

export function validators(): Record<string, Validator> {
  return CHAIN_ID.isSepolia() ? sepoliaValidators : mainnetValidators;
}

export interface DelegatePosition {
  validator: Validator;
  pool: Pool;
  member: PoolMember | null;
}

export const validatorKey = writable("");
export const pools = writable<Pool[]>([]);
export const loadingPools = writable(false);
export const poolContract = writable("");
export const amount = writable("");
export const submitting = writable(false);
export const dryRunning = writable(false);
export const dryRunResult = writable<DryRunResult | null>(null);
export const positions = writable<DelegatePosition[]>([]);
export const busyPool = writable<string | null>(null);

function selectedValidator(): Validator | undefined {
  return validators()[get(validatorKey)];
}

export async function selectValidator(key: string): Promise<void> {
  const validator = validators()[key];
  validatorKey.set(key);
  pools.set([]);
  poolContract.set("");
  dryRunResult.set(null);
  if (!validator) return;
  loadingPools.set(true);
  try {
    // A validator can expose several token pools (STRK, BTC, …).
    const list = await sdk.getStakerPools(validator.stakerAddress);
    pools.set(list);
    poolContract.set(list[0]?.poolContract ?? "");
  } catch {
    pools.set([]);
  } finally {
    loadingPools.set(false);
  }
}

export function setPool(contract: string) {
  poolContract.set(contract);
  dryRunResult.set(null);
}
export function setAmount(v: string) {
  amount.set(v);
  dryRunResult.set(null);
}

function selectedPool(): Pool | undefined {
  return get(pools).find((p) => p.poolContract === get(poolContract));
}

export async function stake(): Promise<void> {
  const { wallet } = get(walletState);
  const pool = selectedPool();
  const validator = selectedValidator();
  if (!wallet || !pool || !validator || !get(amount).trim()) return;
  submitting.set(true);
  try {
    log(`Staking ${pool.token.symbol}…`, "info");
    const tx = await wallet.stake(
      pool.poolContract,
      Amount.parse(get(amount), pool.token)
    );
    await tx.wait();
    log("Stake confirmed", "success");
    amount.set("");
    positions.update((prev) =>
      prev.some((p) => p.pool.poolContract === pool.poolContract)
        ? prev
        : [...prev, { validator, pool, member: null }]
    );
    await refresh();
  } catch (err) {
    log(`Stake failed: ${err}`, "error");
  } finally {
    submitting.set(false);
  }
}

export async function dryRun(): Promise<void> {
  const { wallet } = get(walletState);
  const pool = selectedPool();
  if (!wallet || !pool || !get(amount).trim()) return;
  dryRunning.set(true);
  dryRunResult.set(null);
  try {
    const result = await wallet
      .tx()
      .stake(pool.poolContract, Amount.parse(get(amount), pool.token))
      .preflight();
    dryRunResult.set(
      result.ok
        ? { ok: true, message: "Simulation passed — the stake would succeed." }
        : { ok: false, message: result.reason }
    );
  } catch (err) {
    dryRunResult.set({ ok: false, message: String(err) });
  } finally {
    dryRunning.set(false);
  }
}

export async function refresh(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  const next = await Promise.all(
    get(positions).map(async (p) => ({
      ...p,
      member: await wallet
        .getPoolPosition(p.pool.poolContract)
        .catch(() => null),
    }))
  );
  positions.set(next);
}

async function poolAction(
  position: DelegatePosition,
  label: string,
  run: () => Promise<{ wait: () => Promise<unknown> }>
): Promise<void> {
  busyPool.set(position.pool.poolContract);
  try {
    log(`${label}…`, "info");
    const tx = await run();
    await tx.wait();
    await refresh();
  } catch (err) {
    log(`${label} failed: ${err}`, "error");
  } finally {
    busyPool.set(null);
  }
}

export function claim(position: DelegatePosition): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return Promise.resolve();
  return poolAction(position, "Claim rewards", () =>
    wallet.claimPoolRewards(position.pool.poolContract)
  );
}
export function exitIntent(position: DelegatePosition): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet || !position.member) return Promise.resolve();
  return poolAction(position, "Exit intent", () =>
    wallet.exitPoolIntent(position.pool.poolContract, position.member!.staked)
  );
}
export function exit(position: DelegatePosition): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return Promise.resolve();
  return poolAction(position, "Exit pool", () =>
    wallet.exitPool(position.pool.poolContract)
  );
}
