import type { Address } from "@/types";

/**
 * Interface for read-only wallet operations.
 *
 * This is a minimal interface that only requires an address,
 * suitable for read-only queries that don't need signing capabilities.
 *
 * @example
 * ```ts
 * import { ReadonlyWallet } from "starkzap";
 *
 * // Create a read-only wallet for balance queries
 * const readonlyWallet = new ReadonlyWallet(userAddress);
 *
 * // Use with ERC20 balance queries
 * const balance = await erc20.balanceOf(readonlyWallet);
 *
 * // Use with staking position queries
 * const position = await staking.getPosition(readonlyWallet);
 * ```
 */
export interface ReadonlyWalletInterface {
  /** The wallet's Starknet address */
  readonly address: Address;
}

/**
 * A minimal wallet implementation for read-only operations.
 *
 * Use this when you only need to query balances or positions
 * without signing transactions. Common use cases include:
 * - Server-side portfolio dashboards
 * - Analytics and leaderboard queries
 * - API routes that display user data
 *
 * @example
 * ```ts
 * import { ReadonlyWallet, Erc20, USDC } from "starkzap";
 *
 * // Create from string address
 * const wallet = new ReadonlyWallet("0x123...");
 *
 * // Use for balance queries
 * const erc20 = new Erc20(USDC, provider);
 * const balance = await erc20.balanceOf(wallet);
 *
 * // Or pass address directly (overload available)
 * const balance = await erc20.balanceOf("0x123..." as Address);
 * ```
 */
export class ReadonlyWallet implements ReadonlyWalletInterface {
  readonly address: Address;

  constructor(address: Address) {
    this.address = address;
  }
}

/**
 * Factory function to create a read-only wallet.
 *
 * Convenience function for creating ReadonlyWallet instances.
 *
 * @param address - The Starknet address
 * @returns A ReadonlyWallet instance
 *
 * @example
 * ```ts
 * import { readonlyWallet } from "starkzap";
 *
 * const wallet = readonlyWallet("0x123...");
 * const balance = await erc20.balanceOf(wallet);
 * ```
 */
export function readonlyWallet(address: Address): ReadonlyWallet {
  return new ReadonlyWallet(address);
}

/**
 * Type guard to check if a value is a ReadonlyWalletInterface.
 *
 * @param value - The value to check
 * @returns True if the value has an address property
 */
export function isReadonlyWallet(
  value: unknown
): value is ReadonlyWalletInterface {
  return (
    typeof value === "object" &&
    value !== null &&
    "address" in value &&
    typeof (value as ReadonlyWalletInterface).address === "string"
  );
}

/**
 * Type guard to check if a value is an Address string.
 *
 * @param value - The value to check
 * @returns True if the value is a string that looks like a Starknet address
 */
export function isAddress(value: unknown): value is Address {
  if (typeof value !== "string") return false;
  // Starknet addresses are hex strings starting with 0x
  return value.startsWith("0x") && value.length >= 3;
}
