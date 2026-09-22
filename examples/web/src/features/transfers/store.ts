import { writable, get } from "svelte/store";
import { Amount, fromAddress } from "starkzap";
import { walletState } from "~/lib/stores/wallet";
import { tokens } from "~/lib/stores/tokens";
import { log } from "~/lib/stores/logger";
import { feeOptions } from "~/lib/stores/settings";

// Batched transfers: stack many rows, send them as one atomic transaction.
export interface TransferItem {
  id: number;
  tokenAddress: string;
  to: string;
  amount: string;
}

let seq = 0;
const newItem = (tokenAddress: string): TransferItem => ({
  id: ++seq,
  tokenAddress,
  to: "",
  amount: "",
});
const isComplete = (i: TransferItem) =>
  !!i.tokenAddress && !!i.to.trim() && !!i.amount.trim();

function firstTokenAddress(): string {
  return get(tokens)[0]?.address ?? "";
}

export const items = writable<TransferItem[]>([newItem(firstTokenAddress())]);
export const submitting = writable(false);

export function addItem(): void {
  items.update((rows) => [...rows, newItem(firstTokenAddress())]);
}
export function updateItem(
  id: number,
  patch: Partial<Omit<TransferItem, "id">>
): void {
  items.update((rows) =>
    rows.map((i) => (i.id === id ? { ...i, ...patch } : i))
  );
}
export function removeItem(id: number): void {
  items.update((rows) => rows.filter((i) => i.id !== id));
}
export function reset(): void {
  items.set([newItem(firstTokenAddress())]);
}

export async function send(): Promise<boolean> {
  const { wallet } = get(walletState);
  if (!wallet) return false;
  const valid = get(items).filter(isComplete);
  if (!valid.length) return false;
  submitting.set(true);
  try {
    const list = get(tokens);
    const builder = wallet.tx();
    for (const item of valid) {
      const token = list.find((t) => t.address === item.tokenAddress);
      if (!token) throw new Error("Unknown token in transfer.");
      builder.transfer(token, {
        to: fromAddress(item.to),
        amount: Amount.parse(item.amount, token),
      });
    }
    log(`Sending ${valid.length} transfer(s)…`, "info");
    const tx = await builder.send(feeOptions());
    await tx.wait();
    log("Transfer confirmed", "success");
    reset();
    return true;
  } catch (err) {
    log(`Transfer failed: ${err}`, "error");
    return false;
  } finally {
    submitting.set(false);
  }
}
