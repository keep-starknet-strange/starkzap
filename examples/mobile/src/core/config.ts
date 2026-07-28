import Constants, { ExecutionEnvironment } from "expo-constants";
import type { PrivacyConfig } from "starkzap-native";

// Public env vars (Expo inlines EXPO_PUBLIC_* at build time).
export const PRIVY_SERVER_URL = process.env.EXPO_PUBLIC_PRIVY_SERVER_URL ?? "";
export const PAYMASTER_PROXY_URL =
  process.env.EXPO_PUBLIC_PAYMASTER_PROXY_URL ?? "";
export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";

// One Alchemy key powers Starknet + Ethereum + Solana RPCs (see network.ts and
// the bridging config). Without it, Starknet falls back to Cartridge RPCs and
// the bridging RPCs are omitted.
export const ALCHEMY_API_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ?? "";
// Solana RPC override (Alchemy only serves solana-mainnet; set this for other
// clusters or a third-party RPC).
export const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? "";

// Bridging (Reown external wallets + Layerswap). Layerswap keys are
// network-scoped.
export const REOWN_PROJECT_ID = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID ?? "";
export const LAYERSWAP_API_KEY_MAINNET =
  process.env.EXPO_PUBLIC_LAYERSWAP_API_KEY_MAINNET ?? "";
export const LAYERSWAP_API_KEY_TESTNET =
  process.env.EXPO_PUBLIC_LAYERSWAP_API_KEY_TESTNET ?? "";
// LayerZero API key ("OFT public key") — enables OFT bridging (mainnet only).
export const OFT_PUBLIC_KEY = process.env.EXPO_PUBLIC_OFT_PUBLIC_KEY ?? "";

// Alchemy RPC URL builders (empty string when no key → callers omit them).
export function alchemyStarknetRpc(network: "mainnet" | "sepolia"): string {
  return ALCHEMY_API_KEY
    ? `https://starknet-${network}.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_API_KEY}`
    : "";
}
export function alchemyEthRpc(network: "mainnet" | "sepolia"): string {
  return ALCHEMY_API_KEY
    ? `https://eth-${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : "";
}
export function alchemySolanaMainnetRpc(): string {
  return ALCHEMY_API_KEY
    ? `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : "";
}

// Privy needs native modules (not bundled in Expo Go), so its login flow only
// works in a dev/custom build. Use this to gate the Privy path.
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// ─── STRK20 privacy pool ────────────────────────────────────────────────────
//
// One pool serves every token, so unlike Tongo there is no per-token contract —
// just the pool plus the two services. All of it is per-network because the app
// switches chains at runtime.
//
// Expo inlines EXPO_PUBLIC_* at build time and cannot read process.env
// dynamically, so every variable is spelled out as a literal here rather than
// looked up by a computed key.
const PRIVACY_POOL_MAINNET = process.env.EXPO_PUBLIC_PRIVACY_POOL_MAINNET ?? "";
const PRIVACY_POOL_SEPOLIA = process.env.EXPO_PUBLIC_PRIVACY_POOL_SEPOLIA ?? "";
const PRIVACY_PROVER_MAINNET =
  process.env.EXPO_PUBLIC_PRIVACY_PROVER_MAINNET ?? "";
const PRIVACY_PROVER_SEPOLIA =
  process.env.EXPO_PUBLIC_PRIVACY_PROVER_SEPOLIA ?? "";
const PRIVACY_DISCOVERY_MAINNET =
  process.env.EXPO_PUBLIC_PRIVACY_DISCOVERY_MAINNET ?? "";
const PRIVACY_DISCOVERY_SEPOLIA =
  process.env.EXPO_PUBLIC_PRIVACY_DISCOVERY_SEPOLIA ?? "";
const PRIVACY_OHTTP_RELAY = process.env.EXPO_PUBLIC_PRIVACY_OHTTP_RELAY ?? "";
// OHTTP defaults to on: without it the viewing key reaches the prover and
// discovery service in plaintext (inside TLS, but readable by the operator).
const PRIVACY_OHTTP = process.env.EXPO_PUBLIC_PRIVACY_OHTTP !== "false";

/**
 * Config for `createPrivacy` / `wallet.privacy()` on the given network, or
 * `undefined` when its endpoints are unset — the STRK20 tab then explains
 * what is missing instead of failing at call time.
 */
export function privacyConfig(
  network: "mainnet" | "sepolia"
): PrivacyConfig | undefined {
  const isMain = network === "mainnet";
  const pool = (isMain ? PRIVACY_POOL_MAINNET : PRIVACY_POOL_SEPOLIA).trim();
  const prover = (
    isMain ? PRIVACY_PROVER_MAINNET : PRIVACY_PROVER_SEPOLIA
  ).trim();
  const discovery = (
    isMain ? PRIVACY_DISCOVERY_MAINNET : PRIVACY_DISCOVERY_SEPOLIA
  ).trim();
  if (!pool || !prover || !discovery) return undefined;

  const relay = PRIVACY_OHTTP_RELAY.trim();
  return {
    poolContractAddress: pool,
    prover,
    discovery,
    ohttp: PRIVACY_OHTTP ? (relay ? { relayUrl: relay } : true) : false,
  };
}
