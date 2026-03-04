import { ExternalChain } from "@/types";

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
  chain: ExternalChain,
  chainId: unknown
): string {
  if (typeof chainId === "string" && chainId.length > 0) {
    return chainId;
  }
  if (typeof chainId === "number" && Number.isFinite(chainId)) {
    return String(chainId);
  }
  throw new Error(
    `Invalid chainId for ${chain}. Expected non-empty string or finite number, received ${describeValue(chainId)}.`
  );
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

export function messageToUtf8(message: string | Uint8Array): string {
  if (typeof message === "string") {
    return message;
  }
  return new TextDecoder().decode(message);
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

export function assertObject(value: unknown, fieldName: string): object {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
  return value;
}
