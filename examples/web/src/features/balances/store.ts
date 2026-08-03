import { writable, get } from "svelte/store";
import { type Amount, type Token } from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { tokens } from "~/lib/stores/tokens";
import { log } from "~/lib/stores/logger";

export interface TokenBalance {
  token: Token;
  amount: Amount;
}

export const balances = writable<TokenBalance[]>([]);
export const loading = writable(false);

export async function refresh(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  loading.set(true);
  try {
    const list = get(tokens);
    const next = await Promise.all(
      list.map(async (token) => ({
        token,
        amount: await wallet.balanceOf(token),
      }))
    );
    balances.set(next);
  } catch (err) {
    log(`Failed to load balances: ${err}`, "error");
  } finally {
    loading.set(false);
  }
}
