import { validateAndParseAddress, type BigNumberish } from "starknet";
import { getAddress } from "ethers";

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

/**
 * Branded type for Ethereum addresses.
 *
 * This provides compile-time type safety to distinguish addresses from
 * regular strings, while remaining a string at runtime.
 */
export type EthereumAddress = string & { readonly __type: "EthereumAddress" };

/**
 * Parse and checksum-validate an Ethereum address.
 * @param value - The address string to parse
 * @returns The checksummed address
 * @throws If the value is not a valid Ethereum address
 */
export function fromEthereumAddress(value: string): EthereumAddress {
  return getAddress(value) as EthereumAddress;
}
