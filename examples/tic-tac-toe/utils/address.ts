import { addAddressPadding } from "starknet";

export function normalizeAddress(value: string | undefined | null): string {
  const raw = (value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return addAddressPadding(raw.toLowerCase());
  } catch {
    try {
      const hex = `0x${BigInt(raw).toString(16)}`;
      return addAddressPadding(hex.toLowerCase());
    } catch {
      return raw.toLowerCase();
    }
  }
}
