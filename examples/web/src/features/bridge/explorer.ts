import { NETWORK } from "~/lib/stores/config";
import type { StoredBridgeTx } from "../../../bridge/tx-storage";

// Block-explorer links for bridge tx hashes.

function etherscan(hash: string): string {
  const base =
    NETWORK === "mainnet"
      ? "https://etherscan.io"
      : "https://sepolia.etherscan.io";
  return `${base}/tx/${hash}`;
}

// On testnet the Solana cluster differs per provider: Layerswap uses devnet,
// Hyperlane uses testnet (see BridgeOperator.getSolanaConnection).
function solana(hash: string, protocol: string): string {
  const cluster =
    NETWORK === "mainnet"
      ? null
      : protocol === "layerswap"
        ? "devnet"
        : "testnet";
  return `https://explorer.solana.com/tx/${hash}${cluster ? `?cluster=${cluster}` : ""}`;
}

function voyager(hash: string): string {
  const base =
    NETWORK === "mainnet"
      ? "https://voyager.online"
      : "https://sepolia.voyager.online";
  return `${base}/tx/${hash}`;
}

// L1 (external chain) explorer link for a stored tx.
export function externalExplorer(tx: StoredBridgeTx): string | undefined {
  if (!tx.externalTxHash) return undefined;
  if (tx.tokenChain === "ethereum") return etherscan(tx.externalTxHash);
  if (tx.tokenChain === "solana")
    return solana(tx.externalTxHash, tx.tokenProtocol);
  return undefined;
}

// L2 (Starknet) explorer link.
export function starknetExplorer(hash: string): string {
  return voyager(hash);
}
