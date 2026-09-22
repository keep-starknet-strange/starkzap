export enum ExternalChain {
  ETHEREUM = "ethereum",
  SOLANA = "solana",
}

/** Network environment a bridge operates against. */
export type BridgeEnv = "mainnet" | "testnet";

/**
 * Address marker used for a chain's native asset, which bridge APIs report with
 * no token contract: the zero address for ETH, the System Program ID for SOL.
 * Single source of truth shared by native-asset detection and Layerswap token
 * discovery.
 */
export const NATIVE_TOKEN_ADDRESS: Record<ExternalChain, string> = {
  [ExternalChain.ETHEREUM]: "0x0000000000000000000000000000000000000000",
  [ExternalChain.SOLANA]: "11111111111111111111111111111111",
};
