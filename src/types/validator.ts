import type { Address } from "@/types/address";

/**
 * Represents a staking validator on Starknet.
 */
export interface Validator {
  /** Validator display name */
  name: string;
  /** Staker contract address */
  stakerAddress: Address;
  /** Logo URL if available */
  logoUrl: URL | null;
}
