import type { SolanaAddress } from "@/types/address";

type SolanaAddressRuntime = {
  PublicKey: new (value: string) => { toBase58(): string };
};

/**
 * Validate a base58-encoded Solana address using an explicit runtime.
 * Internal SDK helper. Not exported from the public `@/types` barrel.
 */
export function fromSolanaAddress(
  value: string,
  runtime: SolanaAddressRuntime
): SolanaAddress {
  return new runtime.PublicKey(value).toBase58() as SolanaAddress;
}
