import {
  ChainId,
  OpenZeppelinPreset,
  ArgentPreset,
  ArgentXV050Preset,
  BraavosPreset,
  DevnetPreset,
  type AccountClassConfig,
} from "starkzap";

// App-level configuration: network resolution + env-derived endpoints.
// Ported from the old main.ts config section (unchanged behavior).

export type AppNetwork = "mainnet" | "sepolia";

const NETWORK_QUERY_PARAM = "network";
const NETWORK_STORAGE_KEY = "starkzap:web:network";

const env = import.meta.env;
const ALCHEMY_API_KEY = env.VITE_ALCHEMY_API_KEY as string | undefined;
const SOLANA_RPC_URL = env.VITE_SOLANA_RPC_URL as string | undefined;

const DEFAULT_RPC_URLS: Record<AppNetwork, string> = {
  mainnet: ALCHEMY_API_KEY
    ? `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_API_KEY}`
    : "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9",
  sepolia: ALCHEMY_API_KEY
    ? `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${ALCHEMY_API_KEY}`
    : "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9",
};

function normalizeNetwork(value: string | null | undefined): AppNetwork | null {
  const n = value?.toLowerCase();
  return n === "mainnet" || n === "sepolia" ? n : null;
}

const ENV_NETWORK =
  normalizeNetwork(env.VITE_NETWORK as string | undefined) ?? "sepolia";

function readStoredNetwork(): AppNetwork | null {
  try {
    return normalizeNetwork(localStorage.getItem(NETWORK_STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistSelectedNetwork(network: AppNetwork): void {
  try {
    if (network === ENV_NETWORK) localStorage.removeItem(NETWORK_STORAGE_KEY);
    else localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    // ignore storage failures; fall back to query/env config
  }
}

function readQueryNetwork(): AppNetwork | null {
  return normalizeNetwork(
    new URLSearchParams(location.search).get(NETWORK_QUERY_PARAM)
  );
}

function resolveConfiguredNetwork(): AppNetwork {
  const q = readQueryNetwork();
  if (q) {
    persistSelectedNetwork(q);
    return q;
  }
  return readStoredNetwork() ?? ENV_NETWORK;
}

export const NETWORK = resolveConfiguredNetwork();
export const CHAIN_ID =
  NETWORK === "mainnet" ? ChainId.MAINNET : ChainId.SEPOLIA;

const SHARED_RPC_URL = env.VITE_RPC_URL as string | undefined;
const MAINNET_RPC_URL = env.VITE_MAINNET_RPC_URL as string | undefined;
const SEPOLIA_RPC_URL = env.VITE_SEPOLIA_RPC_URL as string | undefined;

function resolveRpcUrl(network: AppNetwork): string {
  if (network === "mainnet") {
    return (
      MAINNET_RPC_URL ??
      (ENV_NETWORK === "mainnet" ? SHARED_RPC_URL : undefined) ??
      DEFAULT_RPC_URLS.mainnet
    );
  }
  return (
    SEPOLIA_RPC_URL ??
    (ENV_NETWORK === "sepolia" ? SHARED_RPC_URL : undefined) ??
    DEFAULT_RPC_URLS.sepolia
  );
}

export const RPC_URL = resolveRpcUrl(NETWORK);

export const PRIVY_SERVER_URL =
  (env.VITE_PRIVY_SERVER_URL as string | undefined) ?? "http://localhost:3001";

// Reown/WalletConnect project id — enables the bridge's external wallet connect.
export const REOWN_PROJECT_ID = env.VITE_REOWN_PROJECT_ID as string | undefined;

// Auto-connect: when VITE_PRIVATE_KEY is set the app signs in on load with this
// key + preset (VITE_ACCOUNT_PRESET, default openzeppelin). VITE_NETWORK above
// selects the network.
export const AUTO_PRIVATE_KEY = env.VITE_PRIVATE_KEY as string | undefined;
export const AUTO_ACCOUNT_PRESET =
  (env.VITE_ACCOUNT_PRESET as string | undefined) ?? "openzeppelin";

// Account class presets selectable in the account screen.
export const ACCOUNT_PRESETS: Record<string, AccountClassConfig> = {
  openzeppelin: OpenZeppelinPreset,
  argent: ArgentPreset,
  argentx050: ArgentXV050Preset,
  braavos: BraavosPreset,
  devnet: DevnetPreset,
};

// Bridging endpoints (all optional; SDK only wires what's present).
const OFT_PUBLIC_KEY = env.VITE_OFT_PUBLIC_KEY as string | undefined;
const LAYERSWAP_API_KEY =
  (NETWORK === "mainnet"
    ? (env.VITE_LAYERSWAP_API_KEY_MAINNET as string | undefined)
    : (env.VITE_LAYERSWAP_API_KEY_TESTNET as string | undefined)) ??
  (env.VITE_LAYERSWAP_API_KEY as string | undefined);
const LAYERSWAP_BASE_URL = env.VITE_LAYERSWAP_BASE_URL as string | undefined;

const ETH_BRIDGING_RPC_URL = ALCHEMY_API_KEY
  ? NETWORK === "mainnet"
    ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  : undefined;

// VITE_SOLANA_RPC_URL wins; else Alchemy (mainnet only — Alchemy serves only
// solana-mainnet, and clusterApiUrl gets 403'd from browsers).
const SOL_BRIDGING_RPC_URL =
  SOLANA_RPC_URL ??
  (NETWORK === "mainnet" && ALCHEMY_API_KEY
    ? `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : undefined);

export function buildBridgingConfig() {
  if (
    !ETH_BRIDGING_RPC_URL &&
    !SOL_BRIDGING_RPC_URL &&
    !OFT_PUBLIC_KEY &&
    !LAYERSWAP_API_KEY
  ) {
    return undefined;
  }
  return {
    ...(ETH_BRIDGING_RPC_URL && { ethereumRpcUrl: ETH_BRIDGING_RPC_URL }),
    ...(SOL_BRIDGING_RPC_URL && { solanaRpcUrl: SOL_BRIDGING_RPC_URL }),
    ...(OFT_PUBLIC_KEY && { layerZeroApiKey: OFT_PUBLIC_KEY }),
    ...(LAYERSWAP_API_KEY && { layerswapApiKey: LAYERSWAP_API_KEY }),
    ...(LAYERSWAP_BASE_URL && { layerswapBaseUrl: LAYERSWAP_BASE_URL }),
  };
}

// Tongo confidential contract addresses per token (privacy feature).
// Full list: https://docs.tongo.cash/protocol/contracts.html
const TONGO_CONTRACTS_SEPOLIA: Record<string, string> = {
  STRK: "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
  ETH: "0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
  USDC: "0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
  WBTC: "0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e",
};
const TONGO_CONTRACTS_MAINNET: Record<string, string> = {
  STRK: "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498",
  ETH: "0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89",
  WBTC: "0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27",
  "USDC.e": "0x72098b84989a45cc00697431dfba300f1f5d144ae916e98287418af4e548d96",
  USDC: "0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a",
  USDT: "0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0",
  DAI: "0x511741b1ad1777b4ad59fbff49d64b8eb188e2aeb4fc72438278a589d8a10d8",
};
export const TONGO_CONTRACTS = CHAIN_ID.isSepolia()
  ? TONGO_CONTRACTS_SEPOLIA
  : TONGO_CONTRACTS_MAINNET;

// Switch network by reloading with the query param — mirrors the old behavior
// (a fresh SDK + wallet per network is simpler than live-rebuilding).
export function switchNetwork(next: AppNetwork): void {
  if (next === NETWORK) return;
  persistSelectedNetwork(next);
  const url = new URL(location.href);
  if (next === ENV_NETWORK) url.searchParams.delete(NETWORK_QUERY_PARAM);
  else url.searchParams.set(NETWORK_QUERY_PARAM, next);
  location.replace(url.toString());
}
