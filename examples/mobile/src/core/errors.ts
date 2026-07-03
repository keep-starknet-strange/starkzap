// Result of a dry-run (preflight) simulation shown in the UI.
export interface DryRunResult {
  ok: boolean;
  message: string;
}

// Turn provider errors about missing pools/routes into a friendly hint.
// Everything else passes through unchanged.
const UNSUPPORTED_PAIR =
  /pair pools request failed|TWAMM-enabled pool|did not include an exact|no pool|not supported|unsupported|no route|insufficient liquidity|no liquidity/i;

export function friendlyPairError(
  err: unknown,
  action: string,
  network: string
): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (UNSUPPORTED_PAIR.test(raw)) {
    return `${action} isn't available for this pair on ${network}. Try a different pair or switch network.`;
  }
  return raw;
}
