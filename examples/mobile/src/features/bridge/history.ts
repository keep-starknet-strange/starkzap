import AsyncStorage from "@react-native-async-storage/async-storage";

export interface StoredBridgeTx {
  id: string;
  timestamp: number;
  type: "deposit" | "initiateWithdraw";
  tokenId: string;
  tokenSymbol: string;
  amount: string;
  externalTxHash?: string;
  snTxHash?: string;
  recipient?: string;
  lastStatus?: string;
  depositState?: string;
  withdrawalState?: string;
  // CCTP attestation captured during monitoring, needed to complete withdraw.
  cctpAttestation?: string;
  cctpMessage?: string;
  checkedAt?: number;
}

const keyFor = (chainId: string, address: string) =>
  `starkzap:bridge:${chainId}:${address.toLowerCase()}`;

export async function loadHistory(
  chainId: string,
  address: string
): Promise<StoredBridgeTx[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(chainId, address));
    return raw ? (JSON.parse(raw) as StoredBridgeTx[]) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(
  chainId: string,
  address: string,
  txs: StoredBridgeTx[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(chainId, address), JSON.stringify(txs));
  } catch {
    // best-effort persistence
  }
}
