import { shortString } from "starknet";
import type { CartridgeSessionPolicies } from "@/cartridge/types";
import { SessionProtocolError } from "@/cartridge/ts/errors";

const DEFAULT_PRESET_BASE_URL = "https://static.cartridge.gg/presets";

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}>;

interface PresetIndex {
  baseUrl?: unknown;
}

interface PresetConfig {
  chains?: Record<string, { policies?: CartridgeSessionPolicies }>;
}

export interface ResolvePresetPoliciesArgs {
  preset: string;
  chainId: string;
  fetchImpl: FetchLike;
  presetBaseUrl?: string;
}

function decodeChainId(chainId: string): string {
  const trimmed = chainId.trim();
  if (!trimmed) {
    throw new SessionProtocolError(
      "Cannot resolve preset policies without a chain ID."
    );
  }

  if (!trimmed.startsWith("0x")) {
    return trimmed;
  }

  try {
    return shortString.decodeShortString(trimmed);
  } catch {
    return trimmed;
  }
}

async function fetchJson<T>(
  fetchImpl: FetchLike,
  url: string,
  context: string
): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new SessionProtocolError(
      `${context} failed with ${response.status} ${response.statusText}.`
    );
  }
  return (await response.json()) as T;
}

export async function resolvePresetPolicies({
  preset,
  chainId,
  fetchImpl,
  presetBaseUrl = DEFAULT_PRESET_BASE_URL,
}: ResolvePresetPoliciesArgs): Promise<CartridgeSessionPolicies> {
  const index = await fetchJson<PresetIndex>(
    fetchImpl,
    `${presetBaseUrl}/index.json`,
    "Loading Cartridge preset index"
  );
  const baseUrl =
    typeof index.baseUrl === "string" && index.baseUrl.trim().length > 0
      ? index.baseUrl
      : presetBaseUrl;

  const config = await fetchJson<PresetConfig>(
    fetchImpl,
    `${baseUrl.replace(/\/+$/, "")}/${preset}/config.json`,
    `Loading Cartridge preset "${preset}"`
  );

  const decodedChainId = decodeChainId(chainId);
  const policies = config.chains?.[decodedChainId]?.policies;
  if (!policies) {
    throw new SessionProtocolError(
      `Preset "${preset}" does not define policies for chain "${decodedChainId}".`
    );
  }

  return policies;
}
