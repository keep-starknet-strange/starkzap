import type { Address } from "@/types";
import { CallData, type Call } from "starknet";
import { BASE_URL, SEPOLIA_BASE_URL } from "@avnu/avnu-sdk";

export const DEFAULT_AVNU_API_BASES = {
  SN_MAIN: [BASE_URL],
  SN_SEPOLIA: [SEPOLIA_BASE_URL, BASE_URL],
} as const;

export type AvnuApiBases = Record<"SN_MAIN" | "SN_SEPOLIA", string[]>;

export function normalizeAvnuCalls(
  calls: Call[],
  emptyMessage: string
): Call[] {
  if (calls.length === 0) {
    throw new Error(emptyMessage);
  }

  return calls.map((call) => ({
    contractAddress: call.contractAddress as Address,
    entrypoint: `${call.entrypoint}`,
    calldata: CallData.compile(call.calldata ?? []),
  }));
}
