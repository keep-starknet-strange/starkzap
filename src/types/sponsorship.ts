import type { Call } from "starknet";

/**
 * A hint passed from the client to your backend to help decide
 * whether to sponsor a transaction.
 *
 * @example
 * ```ts
 * { action: "onboarding" }
 * { action: "btc_payout", userId: "user_123" }
 * ```
 */
export interface SponsorPolicyHint {
  /** The type of action being performed (e.g., "onboarding", "stake_btc") */
  action: string;
  /** Additional context your backend may need */
  [key: string]: unknown;
}

/**
 * The request sent to your backend's sponsorship endpoint.
 *
 * Your backend should:
 * 1. Verify the `calls` match the claimed `policyHint`
 * 2. Check if this user/action qualifies for sponsorship
 * 3. Return a `SponsorshipResponse` or reject
 *
 * @example
 * ```ts
 * {
 *   calls: [{ contractAddress: "0x...", entrypoint: "transfer", calldata: [...] }],
 *   callerAddress: "0xUSER_ADDRESS",
 *   chainId: "SN_MAIN",
 *   policyHint: { action: "onboarding" }
 * }
 * ```
 */
export interface SponsorshipRequest {
  /** The transaction calls to be executed */
  calls: Call[];
  /** The address of the account sending the transaction */
  callerAddress: string;
  /** The Starknet chain ID (e.g., "SN_MAIN", "SN_SEPOLIA") */
  chainId: string;
  /** Optional hint for your backend's sponsorship policy */
  policyHint?: SponsorPolicyHint | undefined;
}

/**
 * The response from your backend's sponsorship endpoint.
 *
 * At minimum, must include `maxFee` — the maximum fee your paymaster
 * will cover. Additional fields depend on your paymaster implementation
 * (e.g., signatures, nonces, expiry timestamps).
 *
 * @example
 * ```ts
 * {
 *   maxFee: "0x2386f26fc10000",
 *   paymasterSignature: ["0x...", "0x..."],
 *   expiresAt: 1699999999
 * }
 * ```
 */
export interface SponsorshipResponse {
  /** The maximum fee (in wei) that the paymaster will cover */
  maxFee: string;
  /** Additional paymaster-specific fields */
  [key: string]: unknown;
}
