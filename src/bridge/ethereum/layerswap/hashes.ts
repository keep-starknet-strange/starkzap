import { num } from "starknet";

/**
 * LayerSwap's `/api/v2/swaps/by_transaction_hash` does an exact-match lookup,
 * so the hash must be fully padded to 32 bytes. Starknet RPCs return felt-
 * style hashes like `0x3397f2d…` (63 hex chars) when the leading nibble is
 * zero — those are rejected. Ethereum hashes are always 32 bytes from the
 * RPC and Solana signatures are base58, so they pass through unchanged.
 */
export type LsHashNetwork = "starknet" | "ethereum" | "solana";

export function normalizeLsTxHash(
  hash: string,
  network: LsHashNetwork
): string {
  if (network === "starknet") return num.toHex64(hash);
  return hash;
}
