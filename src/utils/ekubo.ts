import type { ChainId } from "@/types";

export function supportsEkuboChain(chainId: ChainId): boolean {
  const literal = chainId.toLiteral();
  return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
}

export function getEkuboChainLiteral(
  chainId: ChainId,
  feature: string
): "SN_MAIN" | "SN_SEPOLIA" {
  const literal = chainId.toLiteral();
  if (literal === "SN_MAIN" || literal === "SN_SEPOLIA") {
    return literal;
  }
  throw new Error(`Unsupported chain for Ekubo ${feature}: ${literal}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getEkuboErrorMessageFromPayload(
  payload: unknown
): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  return typeof payload.error === "string" ? payload.error : null;
}
