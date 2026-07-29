import { writable, get } from "svelte/store";
import { PAYMASTER_NODE_URL } from "./config";

// Whether sponsorship can be offered at all. The SDK only gets a paymaster when
// a proxy URL is configured, and without one every sponsored transaction fails.
// Not a store: it is fixed for the lifetime of the page.
export const sponsoredAvailable = Boolean(PAYMASTER_NODE_URL);

// Global "sponsored" preference — the paymaster pays the gas, so the user pays
// nothing. Features that support it pass `{ feeMode: "sponsored" }`.
export const sponsored = writable(false);

export function feeOptions(): { feeMode: "sponsored" } | undefined {
  return sponsoredAvailable && get(sponsored)
    ? { feeMode: "sponsored" }
    : undefined;
}
