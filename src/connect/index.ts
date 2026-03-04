import { connectEvmWallet } from "@/connect/evm";
import { connectSolanaWallet } from "@/connect/solana";
import type { ConnectedWallet } from "@/connect/types";
import { describeValue } from "@/connect/utils";

export * from "@/connect/types";
export { connectEvmWallet } from "@/connect/evm";
export { connectSolanaWallet } from "@/connect/solana";

export type ProviderNamespace = "eip155" | "solana" | "bip122";

const SUPPORTED_PROVIDER_NAMESPACES: readonly ProviderNamespace[] = [
  "eip155",
  "solana",
];

function normalizeProviderNamespace(providerType: unknown): ProviderNamespace {
  const namespace =
    typeof providerType === "string"
      ? providerType
      : typeof providerType === "object" &&
          providerType !== null &&
          "namespace" in providerType
        ? providerType.namespace
        : undefined;

  if (
    namespace === "eip155" ||
    namespace === "solana" ||
    namespace === "bip122"
  ) {
    return namespace;
  }

  throw new Error(
    `Unsupported providerType namespace ${describeValue(namespace)}. Supported namespaces: ${SUPPORTED_PROVIDER_NAMESPACES.join(", ")}.`
  );
}

export function connectWallet(
  provider: unknown,
  providerType: unknown,
  address: string,
  chainId: unknown
): ConnectedWallet {
  const namespace = normalizeProviderNamespace(providerType);

  if (namespace === "eip155") {
    return connectEvmWallet(provider, address, chainId);
  }

  if (namespace === "solana") {
    return connectSolanaWallet(provider, address, chainId);
  }

  throw new Error(
    `Unsupported provider namespace ${describeValue(namespace)}.`
  );
}
