import { Amount, type ExecuteOptions, type Token } from "@starkzap/native";

const EMPTY_STATE_LABEL = "—";
const FEE_MODE_SPONSORED = "sponsored" as const;
const FEE_MODE_USER_PAYS = "user_pays" as const;

export const PERCENT_SCALE = 10_000n;

export function parseAmountInput(
  value: string,
  token: Token | null
): Amount | null {
  if (!token || !value.trim()) return null;
  try {
    return Amount.parse(value.trim(), token);
  } catch {
    return null;
  }
}

export function getAmountError(
  value: string,
  token: Token | null
): string | null {
  if (!value.trim()) return null;
  if (!token) return "Token unavailable";
  try {
    const parsed = Amount.parse(value.trim(), token);
    if (parsed.toBase() <= 0n) return "Amount must be greater than zero";
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function amountFromBase(
  value: bigint | null | undefined,
  token: Token | null
): string {
  if (value == null || !token) return EMPTY_STATE_LABEL;
  return Amount.fromRaw(value, token).toFormatted(true);
}

export function getExecuteOptions(
  useSponsored: boolean,
  canUseSponsored: boolean
): ExecuteOptions {
  return {
    feeMode:
      useSponsored && canUseSponsored ? FEE_MODE_SPONSORED : FEE_MODE_USER_PAYS,
  };
}

export function parsePercentInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }

  const [integerPart, fractionPart = ""] = trimmed.split(".");
  const basisPoints =
    BigInt(integerPart || "0") * 100n +
    BigInt((fractionPart + "00").slice(0, 2));
  return basisPoints <= PERCENT_SCALE ? basisPoints : null;
}

export function getPercentError(value: string): string | null {
  if (!value.trim()) return null;
  return parsePercentInput(value) == null
    ? "Enter a value from 0 to 100"
    : null;
}

export function sameAddress(
  left?: string | null,
  right?: string | null
): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

export function formatPercentInput(value: bigint): string {
  const clamped =
    value < 0n ? 0n : value > PERCENT_SCALE ? PERCENT_SCALE : value;
  const integer = clamped / 100n;
  const fraction = clamped % 100n;
  return fraction === 0n
    ? integer.toString()
    : `${integer}.${fraction.toString().padStart(2, "0")}`.replace(/0+$/, "");
}
