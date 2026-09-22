import type { Address, ChainId } from "@/types";
import { CallData, type Call } from "starknet";

export type AvnuSdkModule = typeof import("@avnu/avnu-sdk");

let cachedAvnuSdk: AvnuSdkModule | undefined;
let loadingAvnuSdk: Promise<AvnuSdkModule> | undefined;

/**
 * Lazily loads @avnu/avnu-sdk and caches the module namespace object.
 *
 * The dependency is an optional peer dependency: it is only required when AVNU
 * swap or DCA features are actually used. This is the single place where the
 * SDK's presence is checked at runtime.
 */
export async function loadAvnuSdk(feature: string): Promise<AvnuSdkModule> {
  if (cachedAvnuSdk) {
    return cachedAvnuSdk;
  }

  // NOTE: the import() must be wrapped in try/catch (not a .catch() chain):
  // webpack only downgrades an unresolvable dynamic import to a build warning
  // (with a runtime error) when the import() sits inside a try block — the
  // same pattern the Cartridge loader in src/wallet/cartridge.ts relies on.
  // With a .then()/.catch() chain instead, consumers without the optional
  // peer installed get a hard "Module not found" build error.
  loadingAvnuSdk ??= (async () => {
    try {
      const module = await import("@avnu/avnu-sdk");
      cachedAvnuSdk = module as unknown as AvnuSdkModule;
      return cachedAvnuSdk;
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? ` Original error: ${error.message}`
          : "";
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "@avnu/avnu-sdk". Install it with: npm i @avnu/avnu-sdk.${detail}`
      );
    } finally {
      loadingAvnuSdk = undefined;
    }
  })();

  return await loadingAvnuSdk;
}

export type AvnuApiBases = Record<"SN_MAIN" | "SN_SEPOLIA", string[]>;

/** Subset of the avnu SDK namespace exposing its API base URL constants. */
export interface AvnuApiBaseUrls {
  BASE_URL: string;
  SEPOLIA_BASE_URL: string;
}

/**
 * Resolve per-chain AVNU API bases from the loaded avnu SDK's URL constants,
 * applying any caller-provided overrides.
 *
 * The URLs are read from the SDK at runtime (rather than inlined) so they stay
 * in sync with the dependency's published values.
 */
export function resolveAvnuApiBases(
  sdk: AvnuApiBaseUrls,
  overrides?: Partial<AvnuApiBases>
): AvnuApiBases {
  return {
    SN_MAIN: overrides?.SN_MAIN ?? [sdk.BASE_URL],
    SN_SEPOLIA: overrides?.SN_SEPOLIA ?? [sdk.SEPOLIA_BASE_URL],
  };
}

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
