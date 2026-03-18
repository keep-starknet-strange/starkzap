import type { ChainIdLiteral } from "@starkzap/native";

export const MAINNET_PAYMASTER_DISABLED_MESSAGE =
  "Paymaster: disabled on Mainnet without explicit EXPO_PUBLIC_PAYMASTER_PROXY_URL";

export function resolveExamplePaymasterNodeUrl(params: {
  explicitProxyUrl?: string;
  privyServerUrl?: string;
  chainId: ChainIdLiteral;
}): string | null {
  const explicitProxyUrl = params.explicitProxyUrl?.trim();
  if (explicitProxyUrl) {
    return explicitProxyUrl;
  }

  const privyServerUrl = params.privyServerUrl?.trim();
  if (!privyServerUrl || params.chainId !== "SN_SEPOLIA") {
    return null;
  }

  return `${privyServerUrl.replace(/\/$/, "")}/api/paymaster`;
}
