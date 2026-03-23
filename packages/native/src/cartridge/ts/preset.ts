import { shortString } from "starknet";
import type { CartridgeSessionPolicies } from "@/cartridge/types";
import { SessionProtocolError } from "@/cartridge/ts/errors";
import {
  asRecord,
  fetchWithTimeout,
  normalizeHttpUrl,
  type FetchLike,
} from "@/cartridge/ts/shared";

const DEFAULT_PRESET_BASE_URL = "https://static.cartridge.gg/presets";
const DEFAULT_PRESET_REQUEST_TIMEOUT_MS = 15_000;
const TRUSTED_CARTRIDGE_PRESET_DOMAIN = "cartridge.gg";

type Validator<T> = (obj: unknown) => obj is T;

interface PresetIndex {
  baseUrl?: string;
}

interface PresetChain {
  policies?: CartridgeSessionPolicies;
}

interface PresetConfig {
  chains?: Record<string, PresetChain>;
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

function isPresetIndex(value: unknown): value is PresetIndex {
  const record = asRecord(value);
  return (
    record !== null &&
    (record.baseUrl === undefined || typeof record.baseUrl === "string")
  );
}

function isCartridgeSessionPolicies(
  value: unknown
): value is CartridgeSessionPolicies {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    (record.contracts === undefined || asRecord(record.contracts) !== null) &&
    (record.messages === undefined || Array.isArray(record.messages))
  );
}

function isPresetConfig(value: unknown): value is PresetConfig {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  if (record.chains === undefined) {
    return true;
  }

  const chains = asRecord(record.chains);
  if (!chains) {
    return false;
  }

  return Object.values(chains).every((chain) => {
    const chainRecord = asRecord(chain);
    return (
      chainRecord !== null &&
      (chainRecord.policies === undefined ||
        isCartridgeSessionPolicies(chainRecord.policies))
    );
  });
}

function describePayload(payload: unknown): string {
  try {
    const serialized = JSON.stringify(payload);
    if (serialized !== undefined) {
      return serialized.length > 300
        ? `${serialized.slice(0, 297)}...`
        : serialized;
    }
  } catch {
    // Fall back to String() when the payload cannot be serialized.
  }

  return String(payload);
}

function describeTransportError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message.endsWith(".") ? message : `${message}.`;
    }
  }

  return "Unknown transport error.";
}

function isTrustedCartridgePresetHostname(hostname: string): boolean {
  return (
    hostname === TRUSTED_CARTRIDGE_PRESET_DOMAIN ||
    hostname.endsWith(`.${TRUSTED_CARTRIDGE_PRESET_DOMAIN}`)
  );
}

function getNormalizedUrlPort(url: URL): string {
  if (url.port) {
    return url.port;
  }

  if (url.protocol === "https:") {
    return "443";
  }

  if (url.protocol === "http:") {
    return "80";
  }

  return "";
}

function isTrustedPresetBaseUrl(expectedUrl: URL, actualUrl: URL): boolean {
  if (
    actualUrl.protocol !== expectedUrl.protocol ||
    getNormalizedUrlPort(actualUrl) !== getNormalizedUrlPort(expectedUrl) ||
    actualUrl.username.length > 0 ||
    actualUrl.password.length > 0
  ) {
    return false;
  }

  if (actualUrl.hostname === expectedUrl.hostname) {
    return true;
  }

  // Allow Cartridge-managed preset hosting to move between trusted
  // cartridge.gg subdomains without trusting arbitrary remote hosts.
  return (
    isTrustedCartridgePresetHostname(expectedUrl.hostname) &&
    isTrustedCartridgePresetHostname(actualUrl.hostname)
  );
}

function resolvePresetConfigBaseUrl(
  presetBaseUrl: string,
  indexBaseUrl?: string
): string {
  const trimmedBaseUrl = indexBaseUrl?.trim();
  if (!trimmedBaseUrl) {
    return presetBaseUrl.replace(/\/+$/, "");
  }

  let expectedUrl: URL;
  try {
    expectedUrl = new URL(presetBaseUrl);
  } catch (error) {
    throw new SessionProtocolError(
      `Configured Cartridge preset base URL is invalid: ${presetBaseUrl}.`,
      error
    );
  }

  let actualUrl: URL;
  try {
    actualUrl = new URL(trimmedBaseUrl, expectedUrl);
  } catch (error) {
    throw new SessionProtocolError(
      `Loading Cartridge preset index returned an invalid baseUrl "${trimmedBaseUrl}".`,
      error
    );
  }

  if (!isTrustedPresetBaseUrl(expectedUrl, actualUrl)) {
    throw new SessionProtocolError(
      `Loading Cartridge preset index returned an untrusted baseUrl "${actualUrl.toString()}".`
    );
  }

  return actualUrl.toString().replace(/\/+$/, "");
}

function normalizeConfiguredPresetBaseUrl(presetBaseUrl: string): string {
  try {
    return normalizeHttpUrl(presetBaseUrl, "presetBaseUrl");
  } catch (error) {
    throw new SessionProtocolError(
      `Configured Cartridge preset base URL is invalid: ${presetBaseUrl}.`,
      error
    );
  }
}

async function fetchJson<T>(
  fetchImpl: FetchLike,
  url: string,
  context: string,
  validate?: Validator<T>
): Promise<T> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      url,
      {},
      {
        requestTimeoutMs: DEFAULT_PRESET_REQUEST_TIMEOUT_MS,
        timeoutMessage: `Cartridge preset request timed out after ${DEFAULT_PRESET_REQUEST_TIMEOUT_MS}ms.`,
        createTimeoutError: (message, cause) =>
          new SessionProtocolError(message, cause),
      }
    );
  } catch (error) {
    throw new SessionProtocolError(
      `${context} failed: ${describeTransportError(error)}`,
      error
    );
  }

  if (!response.ok) {
    throw new SessionProtocolError(
      `${context} failed with ${response.status} ${response.statusText}.`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new SessionProtocolError(`${context} returned invalid JSON.`, error);
  }

  if (validate && !validate(payload)) {
    throw new SessionProtocolError(
      `${context} returned an invalid JSON payload: ${describePayload(payload)}.`,
      { payload }
    );
  }

  return payload as T;
}

export async function resolvePresetPolicies({
  preset,
  chainId,
  fetchImpl,
  presetBaseUrl = DEFAULT_PRESET_BASE_URL,
}: ResolvePresetPoliciesArgs): Promise<CartridgeSessionPolicies> {
  const normalizedPresetBaseUrl =
    normalizeConfiguredPresetBaseUrl(presetBaseUrl);
  const index = await fetchJson<PresetIndex>(
    fetchImpl,
    `${normalizedPresetBaseUrl}/index.json`,
    "Loading Cartridge preset index",
    isPresetIndex
  );
  const baseUrl = resolvePresetConfigBaseUrl(
    normalizedPresetBaseUrl,
    index.baseUrl
  );

  const config = await fetchJson<PresetConfig>(
    fetchImpl,
    `${baseUrl}/${preset}/config.json`,
    `Loading Cartridge preset "${preset}"`,
    isPresetConfig
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
