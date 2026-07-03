import Constants from "expo-constants";
import { NETWORKS } from "@/core/network";
import { ACCOUNT_PRESETS } from "@/core/wallet/store";

// Optional dev convenience: when EXPO_PRIVATE_KEY (+ optional EXPO_ACCOUNT_PRESET
// / EXPO_NETWORK) are set in .env, skip the login screen and connect directly.
// These come in via app.config.js -> extra (see that file for why).

export interface DevLogin {
  privateKey: string;
  presetName: string;
  networkIndex: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getDevLogin(): DevLogin | null {
  const extra = Constants.expoConfig?.extra ?? {};
  const privateKey = str(extra.devPrivateKey);
  if (!privateKey) return null;

  const presetRaw = str(extra.devAccountPreset);
  const presetName = presetRaw in ACCOUNT_PRESETS ? presetRaw : "Ready";

  const networkRaw = str(extra.devNetwork).toLowerCase();
  const foundIndex = NETWORKS.findIndex(
    (n) =>
      n.name.toLowerCase() === networkRaw ||
      n.chainId.toLiteral().toLowerCase() === networkRaw
  );

  return { privateKey, presetName, networkIndex: Math.max(0, foundIndex) };
}
