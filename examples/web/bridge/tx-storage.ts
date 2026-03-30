/**
 * Persistent storage for in-flight bridge transactions.
 *
 * Records are keyed by Starknet chain ID + wallet address so each
 * account/network combination has its own isolated history. Entries stay in
 * storage until explicitly removed, allowing the user to return after a page
 * reload and pick up where they left off.
 */

export type BridgeTxType = "deposit" | "initiateWithdraw";

export interface StoredBridgeTx {
  /** Unique identifier for this record (crypto.randomUUID). */
  id: string;
  /** Unix timestamp (ms) when the transaction was submitted. */
  timestamp: number;
  type: BridgeTxType;

  // ---- Token metadata (enough to display and reconstruct calls) ----
  tokenId: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** ExternalChain string value, e.g. "ethereum" or "solana". */
  tokenChain: string;
  /** Protocol string value, e.g. "canonical" or "cctp". */
  tokenProtocol: string;

  // ---- Amount ----
  /** Raw bigint amount serialised as a decimal string. */
  amountRaw: string;

  // ---- Hashes ----
  /** L1/Solana transaction hash (deposit, or complete-withdrawal step). */
  externalTxHash?: string;
  /** Starknet transaction hash (initiate-withdraw, or derived deposit hash). */
  snTxHash?: string;

  // ---- Withdrawal extras ----
  /** External-chain recipient address stored at initiation time. */
  recipientExternalAddress?: string;
  fastTransfer?: boolean;
  autoWithdraw?: boolean;

  // ---- CCTP attestation (populated after Circle attests) ----
  cctpAttestation?: string;
  cctpMessage?: string;
  cctpNonce?: string;
  cctpExpirationBlock?: number;

  // ---- Status bookkeeping ----
  /** Last observed BridgeTransferStatus string value. */
  lastStatus?: string;
  /** Last observed WithdrawalState string value (initiateWithdraw records only). */
  withdrawalState?: string;
  /** Last observed DepositState string value (deposit records only). */
  depositState?: string;
  /** Unix timestamp (ms) of the most recent status check. */
  statusCheckedAt?: number;
}

const STORAGE_KEY_PREFIX = "starkzap:bridge-txs:";

function storageKey(chainId: string, walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}${chainId}:${walletAddress.toLowerCase()}`;
}

export function loadTxHistory(
  chainId: string,
  walletAddress: string
): StoredBridgeTx[] {
  try {
    const raw = localStorage.getItem(storageKey(chainId, walletAddress));
    if (!raw) return [];
    return JSON.parse(raw) as StoredBridgeTx[];
  } catch {
    return [];
  }
}

export function saveTxHistory(
  chainId: string,
  walletAddress: string,
  records: StoredBridgeTx[]
): void {
  try {
    localStorage.setItem(
      storageKey(chainId, walletAddress),
      JSON.stringify(records)
    );
  } catch {
    // Storage quota exceeded or unavailable — silently ignore.
  }
}

export function newTxId(): string {
  return crypto.randomUUID();
}
