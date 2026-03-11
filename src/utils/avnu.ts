import type { Address, ChainId } from "@/types";
import { CallData, type Call } from "starknet";
import { BASE_URL, SEPOLIA_BASE_URL } from "@avnu/avnu-sdk";

export const DEFAULT_AVNU_API_BASES = {
  SN_MAIN: [BASE_URL],
  SN_SEPOLIA: [SEPOLIA_BASE_URL, BASE_URL],
} as const;

export type AvnuApiBases = Record<"SN_MAIN" | "SN_SEPOLIA", string[]>;

export function supportsAvnuChain(chainId: ChainId): boolean {
  const literal = chainId.toLiteral();
  return literal === "SN_MAIN" || literal === "SN_SEPOLIA";
}

export function getAvnuApiBases(
  apiBasesByChain: AvnuApiBases,
  chainId: ChainId,
  feature: string
): string[] {
  const literal = chainId.toLiteral();
  let apiBases: string[];

  if (literal === "SN_MAIN") {
    apiBases = apiBasesByChain.SN_MAIN;
  } else if (literal === "SN_SEPOLIA") {
    apiBases = apiBasesByChain.SN_SEPOLIA;
  } else {
    throw new Error(`Unsupported chain for AVNU ${feature}: ${literal}`);
  }

  if (apiBases.length === 0) {
    throw new Error(`No AVNU API base configured for chain: ${literal}`);
  }

  return [...apiBases];
}

export function describeAvnuError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function withAvnuApiBaseFallback<T>(params: {
  apiBasesByChain: AvnuApiBases;
  chainId: ChainId;
  feature: string;
  action: string;
  run: (baseUrl: string) => Promise<T>;
  formatFinalError?: (failures: string[]) => string;
}): Promise<T> {
  const failures: string[] = [];

  for (const apiBase of getAvnuApiBases(
    params.apiBasesByChain,
    params.chainId,
    params.feature
  )) {
    try {
      return await params.run(apiBase);
    } catch (error) {
      failures.push(`${apiBase}: ${describeAvnuError(error)}`);
    }
  }

  throw new Error(
    params.formatFinalError?.(failures) ??
      `AVNU ${params.action} failed (${failures.join(" | ")})`
  );
}

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
