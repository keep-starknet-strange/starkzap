import { validateAndParseAddress, type BigNumberish } from "starknet";

/**
 * Branded type for Starknet addresses.
 *
 * This provides compile-time type safety to distinguish addresses from
 * regular strings, while remaining a string at runtime.
 */
export type Address = string & { readonly __type: "StarknetAddress" };

/**
 * Parse a Starknet address from a BigNumberish value.
 * @param value - The address to parse
 * @returns The validated address
 * @throws Argument must be a valid address inside the address range bound
 */
export function fromAddress(value: BigNumberish): Address {
  return validateAndParseAddress(value) as Address;
}
