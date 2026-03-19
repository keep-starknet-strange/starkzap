const SEPOLIA_CHAIN_ID_LITERAL = "SN_SEPOLIA";

export const MAINNET_PAYMASTER_DISABLED_MESSAGE =
  "Paymaster: disabled on Mainnet without explicit EXPO_PUBLIC_PAYMASTER_PROXY_URL";

export function resolveExamplePaymasterNodeUrl(params: {
  explicitProxyUrl?: string;
  privyServerUrl?: string;
  chainId: string;
}): string | null {
  const explicitProxyUrl = params.explicitProxyUrl?.trim();
  if (explicitProxyUrl) {
    return explicitProxyUrl;
  }

  const privyServerUrl = params.privyServerUrl?.trim();
  if (!privyServerUrl || params.chainId !== SEPOLIA_CHAIN_ID_LITERAL) {
    return null;
  }

  return `${privyServerUrl.replace(/\/$/, "")}/api/paymaster`;
}
