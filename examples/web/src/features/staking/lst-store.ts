import { writable, get } from "svelte/store";
import {
  Amount,
  getSupportedLSTAssets,
  getLSTConfig,
  type PoolMember,
} from "starkzap";
import { CHAIN_ID } from "~/lib/stores/config";
import { walletState } from "~/lib/stores/wallet";
import { log } from "~/lib/stores/logger";

export const assets = writable<string[]>([]);
export const positions = writable<Record<string, PoolMember | null>>({});
export const busyAsset = writable<string | null>(null);

export async function load(): Promise<void> {
  assets.set(getSupportedLSTAssets(CHAIN_ID));
  await refresh();
}

export async function refresh(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  const entries = await Promise.all(
    get(assets).map(async (asset) => {
      const member = await wallet
        .lstStaking(asset)
        .getPosition(wallet)
        .catch(() => null);
      return [asset, member] as const;
    })
  );
  positions.set(Object.fromEntries(entries));
}

export async function enter(asset: string, amount: string): Promise<boolean> {
  const { wallet } = get(walletState);
  const config = getLSTConfig(CHAIN_ID, asset);
  if (!wallet || !config || !amount.trim()) return false;
  busyAsset.set(asset);
  try {
    log(`Liquid staking ${asset}…`, "info");
    const tx = await wallet
      .lstStaking(asset)
      .enter(wallet, Amount.parse(amount, config.decimals, config.symbol));
    await tx.wait();
    log("Liquid stake confirmed", "success");
    await refresh();
    return true;
  } catch (err) {
    log(`Liquid stake failed: ${err}`, "error");
    return false;
  } finally {
    busyAsset.set(null);
  }
}

// Redeem the full LST share balance (Endur redeem is immediate — no unpool).
export async function exit(asset: string): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  busyAsset.set(asset);
  try {
    log(`Exiting ${asset}…`, "info");
    const tx = await wallet.lstStaking(asset).exit(wallet);
    await tx.wait();
    await refresh();
  } catch (err) {
    log(`Exit failed: ${err}`, "error");
  } finally {
    busyAsset.set(null);
  }
}
