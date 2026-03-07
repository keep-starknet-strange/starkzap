import type { WalletInterface } from "@/wallet";

/**
 * A type that represents either a raw Starknet address string or a wallet instance.
 *
 * This is used for read-only operations like balance queries and staking position
 * lookups where only the address is needed, not the full wallet capabilities.
 *
 * @example
 * ```ts
 * import { fromAddress } from "@/types/address";
 *
 * // Using a plain string (requires fromAddress for type safety):
 * const address: AddressLike = fromAddress("0x123...");
 *
 * // Or pass a wallet directly:
 * const address: AddressLike = wallet;
 *
 * // Use getAddress to extract the address:
 * const addr = getAddress(addressLike);
 * ```
 */
export type AddressLike = string | WalletInterface;

/**
 * Extract a Starknet address string from an AddressLike value.
 *
 * @param addressLike - Either a string address or a WalletInterface
 * @returns The extracted address string
 *
 * @example
 * ```ts
 * const addr1 = getAddress("0x123...");          // Returns "0x123..."
 * const addr2 = getAddress(wallet);              // Returns wallet.address
 * ```
 */
export function getAddress(addressLike: AddressLike): string {
  if (typeof addressLike === "string") {
    return addressLike;
  }
  return addressLike.address;
}
