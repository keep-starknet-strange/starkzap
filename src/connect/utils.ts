import type { ChainId } from "starkzap";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (isRecord(value)) {
    return "object";
  }
  return typeof value;
}

export function assertNonEmptyString(
  value: unknown,
  fieldName: string
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

export function normalizeChainId(
  starknetChain: ChainId,
  chainId: number | string
): string | number {
  const numericChainId =
    typeof chainId === "string" ? Number(chainId) : chainId;

  if (!Number.isFinite(numericChainId) || numericChainId <= 0) {
    throw new Error(`Invalid EVM chain ID: ${String(chainId)}`);
  }

  if (numericChainId === 1 && !starknetChain.isMainnet()) {
    throw new Error(`EVM chain id expected to be mainnet.`);
  }

  if (numericChainId === 11155111 && !starknetChain.isSepolia()) {
    throw new Error("EVM chain id expected to be sepolia.");
  }

  if (numericChainId !== 1 && numericChainId !== 11155111) {
    throw new Error("EVM chain id expected to be mainnet or sepolia.");
  }

  return chainId;
}

export function bytesToHex(bytes: Uint8Array): string {
  let output = "0x";
  for (const value of bytes) {
    output += value.toString(16).padStart(2, "0");
  }
  return output;
}

export function messageToBytes(message: string | Uint8Array): Uint8Array {
  if (typeof message === "string") {
    return new TextEncoder().encode(message);
  }
  return message;
}

export function readStringResult(
  value: unknown,
  methodName: string,
  keyCandidates: readonly string[] = []
): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (isRecord(value)) {
    for (const key of keyCandidates) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
  }

  throw new Error(
    `${methodName} returned an unexpected result (${describeValue(value)}).`
  );
}
