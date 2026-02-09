import { ChainId } from "@/types";

/**
 * Network configuration preset.
 */
export interface NetworkPreset {
  /** Human-readable network name */
  name: string;
  /** Starknet chain ID */
  chainId: ChainId;
  /** Default RPC URL */
  rpcUrl: string;
  /** Block explorer URL (optional) */
  explorerUrl?: string;
}

/**
 * Starknet Mainnet configuration.
 */
export const mainnet: NetworkPreset = {
  name: "Mainnet",
  chainId: ChainId.from("SN_MAIN"),
  rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
  explorerUrl: "https://voyager.online",
};

/**
 * Starknet Sepolia Testnet configuration.
 */
export const sepolia: NetworkPreset = {
  name: "Sepolia",
  chainId: ChainId.from("SN_SEPOLIA"),
  rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
  explorerUrl: "https://sepolia.voyager.online",
};

/**
 * Local devnet configuration (using starknet-devnet-rs defaults).
 */
export const devnet: NetworkPreset = {
  name: "Devnet",
  chainId: ChainId.from("SN_SEPOLIA"), // Devnet typically uses Sepolia chain ID
  rpcUrl: "http://localhost:5050",
};

/**
 * All available network presets.
 */
export const networks = {
  mainnet,
  sepolia,
  devnet,
} as const;

export type NetworkName = keyof typeof networks;
