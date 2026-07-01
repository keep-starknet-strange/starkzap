import { ChainId } from "starkzap-native";

export interface NetworkOption {
  name: string;
  chainId: ChainId;
  rpcUrl: string;
}

export const NETWORKS: NetworkOption[] = [
  {
    name: "Sepolia",
    chainId: ChainId.SEPOLIA,
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9",
  },
  {
    name: "Mainnet",
    chainId: ChainId.MAINNET,
    rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9",
  },
];
