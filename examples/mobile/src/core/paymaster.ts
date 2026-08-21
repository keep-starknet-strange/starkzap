// Resolves the paymaster (gas sponsorship) node URL for the example.
// Prefers an explicit proxy URL; otherwise falls back to the Privy example
// server's paymaster route on Sepolia only.

const SEPOLIA_CHAIN_ID_LITERAL = "SN_SEPOLIA";

export function resolveExamplePaymasterNodeUrl(params: {
  explicitProxyUrl?: string;
  privyServerUrl?: string;
  chainId: string;
}): string | null {
  const explicit = params.explicitProxyUrl?.trim();
  if (explicit) return explicit;

  const privyServerUrl = params.privyServerUrl?.trim();
  if (!privyServerUrl || params.chainId !== SEPOLIA_CHAIN_ID_LITERAL) {
    return null;
  }

  return `${privyServerUrl.replace(/\/$/, "")}/api/paymaster/sepolia`;
}
