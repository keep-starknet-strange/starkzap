import { ChainId } from "starkzap-native";
import { alchemyStarknetRpc } from "@/core/config";

export interface NetworkOption {
  name: string;
  chainId: ChainId;
  rpcUrl: string;
}

// Prefer Alchemy when a key is configured; otherwise fall back to Cartridge.
const starknetRpc = (network: "mainnet" | "sepolia") =>
  alchemyStarknetRpc(network) ||
  `https://api.cartridge.gg/x/starknet/${network}/rpc/v0_9`;

export const NETWORKS: NetworkOption[] = [
  {
    name: "Sepolia",
    chainId: ChainId.SEPOLIA,
    rpcUrl: starknetRpc("sepolia"),
  },
  {
    name: "Mainnet",
    chainId: ChainId.MAINNET,
    rpcUrl: starknetRpc("mainnet"),
  },
];
