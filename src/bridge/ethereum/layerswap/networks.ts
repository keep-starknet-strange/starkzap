import { type BridgeEnv, ExternalChain } from "@/types/bridge/external-chain";

/**
 * Environment selector for Layerswap routes. Aliases the shared {@link BridgeEnv}
 * so callers can pass `BridgeTokenApiEnv` values through unchanged.
 */
export type LayerswapEnv = BridgeEnv;

/**
 * Layerswap network identifiers for a single Starknet-anchored route.
 *
 * In this SDK Layerswap always bridges with Starknet on one side and exactly
 * one external chain (Ethereum or Solana) on the other, so a route is a pure
 * function of `(chain, env)`. This is the single source of truth for the
 * hardcoded network strings the Layerswap API expects.
 */
export interface LayerswapNetworkRoute {
  /** External-chain network name (e.g. `ETHEREUM_MAINNET`, `SOLANA_DEVNET`). */
  externalNetwork: string;
  /** Starknet-side network name (e.g. `STARKNET_MAINNET`). */
  starknetNetwork: string;
  /** Layerswap network type used to scope route discovery (`evm` | `solana`). */
  networkType: string;
}

const STARKNET_NETWORK: Record<LayerswapEnv, string> = {
  mainnet: "STARKNET_MAINNET",
  testnet: "STARKNET_SEPOLIA",
};

const EXTERNAL_NETWORK: Record<ExternalChain, Record<LayerswapEnv, string>> = {
  [ExternalChain.ETHEREUM]: {
    mainnet: "ETHEREUM_MAINNET",
    testnet: "ETHEREUM_SEPOLIA",
  },
  // ⚠️ Layerswap names the Solana testnet `SOLANA_DEVNET`, not `SOLANA_TESTNET`.
  [ExternalChain.SOLANA]: {
    mainnet: "SOLANA_MAINNET",
    testnet: "SOLANA_DEVNET",
  },
};

const NETWORK_TYPE: Record<ExternalChain, string> = {
  [ExternalChain.ETHEREUM]: "evm",
  [ExternalChain.SOLANA]: "solana",
};

/** Resolve the Layerswap network identifiers for a `(chain, env)` route. */
export function resolveLayerswapRoute(
  chain: ExternalChain,
  env: LayerswapEnv
): LayerswapNetworkRoute {
  return {
    externalNetwork: EXTERNAL_NETWORK[chain][env],
    starknetNetwork: STARKNET_NETWORK[env],
    networkType: NETWORK_TYPE[chain],
  };
}
