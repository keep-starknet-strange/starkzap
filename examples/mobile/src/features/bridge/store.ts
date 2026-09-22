import { create } from "zustand";
import {
  Amount,
  ExternalChain,
  Protocol,
  BridgeTransferStatus,
  DepositState,
  WithdrawalState,
  type BridgeToken,
  type ConnectedExternalWallet,
  type WithdrawMonitorResult,
} from "starkzap-native";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";
import { useExternalWalletStore } from "@/core/external-wallet/store";
import { loadHistory, saveHistory, type StoredBridgeTx } from "./history";

export type ChainFilter = "external" | "ethereum" | "solana";
export type Direction = "to-starknet" | "from-starknet";

interface BridgeStore {
  tokens: BridgeToken[];
  loadingTokens: boolean;
  chainFilter: ChainFilter;
  direction: Direction;
  selectedTokenId: string;
  amount: string;
  // Available balance of the selected token on the relevant side (external
  // chain for deposits, Starknet for withdrawals).
  balance: Amount | null;
  submitting: boolean;
  error: string | null;
  history: StoredBridgeTx[];
  busyId: string | null;

  fetchTokens: () => Promise<void>;
  fetchBalance: () => Promise<void>;
  setChainFilter: (f: ChainFilter) => void;
  setDirection: (d: Direction) => void;
  setToken: (id: string) => void;
  setAmount: (v: string) => void;
  bridge: () => Promise<void>;
  loadHistory: () => Promise<void>;
  checkStatus: (id: string) => Promise<void>;
  completeWithdraw: (id: string) => Promise<void>;
}

let seq = 0;
const newId = () => `${Date.now()}-${++seq}`;

function externalFor(token: BridgeToken): ConnectedExternalWallet | null {
  const { eth, sol } = useExternalWalletStore.getState();
  if (token.chain === ExternalChain.ETHEREUM) return eth;
  if (token.chain === ExternalChain.SOLANA) return sol;
  return null;
}

async function persist(history: StoredBridgeTx[]) {
  const { wallet, networkIndex } = useWalletStore.getState();
  if (!wallet) return;
  await saveHistory(
    NETWORKS[networkIndex].chainId.toLiteral(),
    wallet.address,
    history
  );
}

export const useBridgeStore = create<BridgeStore>((set, get) => ({
  tokens: [],
  loadingTokens: false,
  chainFilter: "external",
  direction: "to-starknet",
  selectedTokenId: "",
  amount: "",
  balance: null,
  submitting: false,
  error: null,
  history: [],
  busyId: null,

  fetchTokens: async () => {
    const { sdk } = useWalletStore.getState();
    const { eth, sol } = useExternalWalletStore.getState();
    if (!sdk) return;
    const chains: ExternalChain[] = [];
    if (eth) chains.push(ExternalChain.ETHEREUM);
    if (sol) chains.push(ExternalChain.SOLANA);
    if (chains.length === 0) {
      set({ tokens: [] });
      return;
    }
    set({ loadingTokens: true });
    try {
      const results = await Promise.all(
        chains.map((c) => sdk.getBridgingTokens(c))
      );
      const tokens = results.flat();
      set({
        tokens,
        selectedTokenId:
          tokens.find((t) => t.id === get().selectedTokenId)?.id ??
          tokens[0]?.id ??
          "",
      });
    } catch (err) {
      set({ error: String(err), tokens: [] });
    } finally {
      set({ loadingTokens: false });
    }
  },
  fetchBalance: async () => {
    const { wallet } = useWalletStore.getState();
    const { tokens, selectedTokenId, direction } = get();
    const token = tokens.find((t) => t.id === selectedTokenId);
    const ext = token ? externalFor(token) : null;
    if (!wallet || !token || !ext) {
      set({ balance: null });
      return;
    }
    try {
      const balance =
        direction === "to-starknet"
          ? await wallet.getDepositBalance(token, ext)
          : await wallet.getWithdrawBalance(token, ext);
      set({ balance });
    } catch {
      set({ balance: null });
    }
  },
  setChainFilter: (chainFilter) => set({ chainFilter }),
  setDirection: (direction) => set({ direction, balance: null }),
  setToken: (selectedTokenId) => set({ selectedTokenId, balance: null }),
  setAmount: (amount) => set({ amount }),

  bridge: async () => {
    const { wallet } = useWalletStore.getState();
    const { tokens, selectedTokenId, amount, direction } = get();
    const token = tokens.find((t) => t.id === selectedTokenId);
    const ext = token ? externalFor(token) : null;
    if (!wallet || !token || !ext || !amount.trim()) return;
    set({ submitting: true, error: null });
    try {
      const amt = Amount.parse(amount, token.decimals, token.symbol);
      let record: StoredBridgeTx;
      if (direction === "to-starknet") {
        const res = await wallet.deposit(wallet.address, amt, token, ext);
        record = {
          id: newId(),
          timestamp: Date.now(),
          type: "deposit",
          tokenId: token.id,
          tokenSymbol: token.symbol,
          amount,
          externalTxHash: res.hash,
        };
      } else {
        const options =
          token.protocol === Protocol.CANONICAL
            ? ({ protocol: "canonical" } as const)
            : token.protocol === Protocol.CCTP
              ? ({ protocol: "cctp" } as const)
              : undefined;
        const tx = await wallet.initiateWithdraw(
          ext.address,
          amt,
          token,
          ext,
          options
        );
        record = {
          id: newId(),
          timestamp: Date.now(),
          type: "initiateWithdraw",
          tokenId: token.id,
          tokenSymbol: token.symbol,
          amount,
          snTxHash: tx.hash,
          recipient: ext.address,
        };
      }
      const history = [record, ...get().history];
      set({ history, amount: "" });
      await persist(history);
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ submitting: false });
    }
  },

  loadHistory: async () => {
    const { wallet, networkIndex } = useWalletStore.getState();
    if (!wallet) return;
    const history = await loadHistory(
      NETWORKS[networkIndex].chainId.toLiteral(),
      wallet.address
    );
    set({ history });
  },

  checkStatus: async (id) => {
    const { wallet } = useWalletStore.getState();
    const record = get().history.find((r) => r.id === id);
    const token = get().tokens.find((t) => t.id === record?.tokenId);
    if (!wallet || !record || !token) return;
    set({ busyId: id, error: null });
    try {
      const updates: Partial<StoredBridgeTx> = { checkedAt: Date.now() };
      if (record.type === "deposit" && record.externalTxHash) {
        const result = await wallet.monitorDeposit(
          token,
          record.externalTxHash,
          record.snTxHash
        );
        updates.lastStatus = BridgeTransferStatus[result.status];
        if (result.starknetTxHash) updates.snTxHash = result.starknetTxHash;
        updates.depositState =
          DepositState[await wallet.getDepositState(token, result)];
      } else if (record.snTxHash) {
        const result = await wallet.monitorWithdrawal(
          token,
          record.snTxHash,
          record.externalTxHash
        );
        updates.lastStatus = BridgeTransferStatus[result.status];
        if (isCctp(result)) {
          updates.cctpAttestation = result.attestation;
          updates.cctpMessage = result.message;
        }
        updates.withdrawalState =
          WithdrawalState[await wallet.getWithdrawalState(token, result)];
      }
      const history = get().history.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      );
      set({ history });
      await persist(history);
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ busyId: null });
    }
  },

  completeWithdraw: async (id) => {
    const { wallet } = useWalletStore.getState();
    const record = get().history.find((r) => r.id === id);
    const token = get().tokens.find((t) => t.id === record?.tokenId);
    const ext = token ? externalFor(token) : null;
    if (!wallet || !record || !token || !ext || !record.recipient) return;
    set({ busyId: id, error: null });
    try {
      const amt = Amount.parse(record.amount, token.decimals, token.symbol);
      const options =
        token.protocol === Protocol.CCTP &&
        record.cctpAttestation &&
        record.cctpMessage
          ? ({
              protocol: "cctp",
              attestation: record.cctpAttestation,
              message: record.cctpMessage,
            } as const)
          : ({ protocol: "canonical" } as const);
      const res = await wallet.completeWithdraw(
        record.recipient as never,
        amt,
        token,
        ext,
        options
      );
      const history = get().history.map((r) =>
        r.id === id ? { ...r, externalTxHash: res.hash } : r
      );
      set({ history });
      await persist(history);
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ busyId: null });
    }
  },
}));

function isCctp(
  r: WithdrawMonitorResult
): r is Extract<WithdrawMonitorResult, { protocol: "cctp" }> {
  return "protocol" in r && r.protocol === "cctp";
}
