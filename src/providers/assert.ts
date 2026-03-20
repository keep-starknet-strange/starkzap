import type { Call } from "starknet";

/**
 * Assert that a prepared action returned at least one call.
 *
 * Shared by DCA, Lending, and Swap modules to validate provider output.
 */
export function assertPreparedCalls(
  calls: Call[],
  domain: string,
  providerId: string
): void {
  if (calls.length > 0) return;
  throw new Error(`${domain} provider "${providerId}" returned no calls`);
}
