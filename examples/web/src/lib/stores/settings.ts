import { writable, get } from "svelte/store";

// Global "sponsored" (gasless / paymaster) preference. Features that support it
// pass `{ feeMode: "sponsored" }` to their transaction when this is on.
export const sponsored = writable(false);

export function feeOptions(): { feeMode: "sponsored" } | undefined {
  return get(sponsored) ? { feeMode: "sponsored" } : undefined;
}
