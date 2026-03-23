import type { ChainId } from "starkzap-native";

export function cropAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl = chainId.isSepolia()
    ? "https://sepolia.voyager.online/tx"
    : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}
