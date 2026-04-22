import { create } from "zustand";
import { Alert } from "react-native";
import {
  Amount,
  type ChainId,
  type TrovesDepositToken,
  type TrovesPosition,
  type TrovesStrategyAPIResult,
  type WalletInterface,
} from "starkzap-native";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { getExplorerUrl } from "@/utils";

export type TrovesAction = "deposit" | "withdraw";

interface TrovesState {
  isLoadingStrategies: boolean;
  strategies: TrovesStrategyAPIResult[];
  positions: Record<string, TrovesPosition | null>;
  tvlUsd: number | null;
  unsupportedReason: string | null;
  isBusy: boolean;

  loadStrategies: (wallet: WalletInterface, chainId: ChainId) => Promise<void>;
  execute: (
    action: TrovesAction,
    strategyId: string,
    token: TrovesDepositToken,
    wallet: WalletInterface,
    chainId: ChainId,
    amountStr: string,
    addLog: (msg: string) => void
  ) => Promise<boolean>;
  clear: () => void;
}

const INITIAL: Omit<TrovesState, "loadStrategies" | "execute" | "clear"> = {
  isLoadingStrategies: false,
  strategies: [],
  positions: {},
  tvlUsd: null,
  unsupportedReason: null,
  isBusy: false,
};

async function loadPosition(
  strategyId: string,
  wallet: WalletInterface
): Promise<[string, TrovesPosition | null]> {
  try {
    const position = await wallet.troves().getPosition(strategyId);
    return [strategyId, position];
  } catch {
    return [strategyId, null];
  }
}

let loadStrategiesVersion = 0;

export const useTrovesStore = create<TrovesState>((set, get) => ({
  ...INITIAL,

  loadStrategies: async (wallet, chainId) => {
    const reqVer = ++loadStrategiesVersion;
    const isCurrent = () => reqVer === loadStrategiesVersion;
    if (!chainId.isMainnet()) {
      if (!isCurrent()) return;
      set({
        ...INITIAL,
        unsupportedReason:
          "Troves is a mainnet-only service. Switch to Starknet Mainnet to use it.",
      });
      return;
    }
    if (!isCurrent()) return;
    set({ isLoadingStrategies: true, unsupportedReason: null });
    try {
      const troves = wallet.troves();
      const [strategiesResponse, stats] = await Promise.all([
        troves.getStrategies(),
        troves.getStats().catch(() => null),
      ]);
      if (!isCurrent()) return;
      const strategies = strategiesResponse.strategies.filter(
        (s: TrovesStrategyAPIResult) => !s.isRetired && !s.isDeprecated
      );
      const positionEntries = await Promise.all(
        strategies.map((s: TrovesStrategyAPIResult) =>
          loadPosition(s.id, wallet)
        )
      );
      if (!isCurrent()) return;
      set({
        strategies,
        tvlUsd: stats?.tvl ?? null,
        positions: Object.fromEntries(positionEntries),
        isLoadingStrategies: false,
      });
    } catch (error) {
      if (!isCurrent()) return;
      set({
        isLoadingStrategies: false,
        unsupportedReason:
          error instanceof Error ? error.message : String(error),
      });
    }
  },

  execute: async (
    action,
    strategyId,
    token,
    wallet,
    chainId,
    amountStr,
    addLog
  ) => {
    if (get().isBusy) return false;
    const verb = action === "deposit" ? "deposit" : "withdraw";
    const arrow = action === "deposit" ? "→" : "←";
    set({ isBusy: true });
    addLog(
      `Troves ${verb}: ${amountStr} ${token.symbol} ${arrow} ${strategyId}`
    );
    try {
      const amount = Amount.parse(amountStr, token);
      const tx = await wallet.troves()[action]({ strategyId, amount });
      addLog(`Tx submitted: ${tx.hash.slice(0, 10)}...`);
      const toastBase = {
        txHash: tx.hash,
        explorerUrl: getExplorerUrl(tx.hash, chainId),
      };
      showTransactionToast(
        {
          ...toastBase,
          title: `Troves ${verb}`,
          subtitle: `${verb === "deposit" ? "Depositing" : "Withdrawing"} ${amountStr} ${token.symbol}`,
        },
        true
      );
      await tx.wait();
      updateTransactionToast({
        ...toastBase,
        title: `Troves ${verb} complete`,
        subtitle: `${amountStr} ${token.symbol} ${verb === "deposit" ? "deposited" : "withdrawn"}`,
      });
      addLog(`Troves ${verb} confirmed for ${strategyId}.`);
      const [, position] = await loadPosition(strategyId, wallet);
      set((state) => ({
        positions: { ...state.positions, [strategyId]: position },
      }));
      return true;
    } catch (error) {
      addLog(`Troves ${verb} failed: ${error}`);
      Alert.alert(`Troves ${verb} failed`, String(error));
      return false;
    } finally {
      set({ isBusy: false });
    }
  },

  clear: () => {
    loadStrategiesVersion++;
    set({ ...INITIAL });
  },
}));
