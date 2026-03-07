import type { Address } from "@/types/address";
import type { WalletInterface } from "@/wallet";

/**
 * A type that represents either a raw Starknet address or a wallet instance.
 *
 * This is used for read-only operations like balance queries and staking position
 * lookups where only the address is needed, not the full wallet capabilities.
 *
 * @example
 * ```ts
 * // All of these are valid AddressLike values:
 * const address: AddressLike = "0x123...";
 * const address: AddressLike = { address: "0x123..." } as WalletInterface;
 *
 * // Use getAddress to extract the address:
 * const addr = getAddress(addressLike);
 * ```
 */
export type AddressLike = Address | WalletInterface;

/**
 * Extract a Starknet address from an AddressLike value.
 *
 * @param addressLike - Either an Address string or a WalletInterface
 * @returns The extracted Address
 *
 * @example
 * ```ts
 * const addr1 = getAddress("0x123...");          // Returns "0x123..."
 * const addr2 = getAddress(wallet);              // Returns wallet.address
 * ```
 */
export function getAddress(addressLike: AddressLike): Address {
  if (typeof addressLike === "string") {
    return addressLike;
  }
  return addressLike.address;
}
