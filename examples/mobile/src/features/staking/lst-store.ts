import { create } from "zustand";
import {
  Amount,
  getSupportedLSTAssets,
  getLSTConfig,
  type PoolMember,
} from "starkzap-native";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";
import { useTxBannerStore } from "@/core/tx-banner/store";

interface LstStore {
  assets: string[];
  positions: Record<string, PoolMember | null>;
  busyAsset: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  enter: (asset: string, amount: string) => Promise<boolean>;
  // Redeem the full LST share balance (Endur redeem is immediate — no unpool).
  exit: (asset: string) => Promise<void>;
}

export const useLstStore = create<LstStore>((set, get) => ({
  assets: [],
  positions: {},
  busyAsset: null,

  load: async () => {
    const { networkIndex } = useWalletStore.getState();
    set({ assets: getSupportedLSTAssets(NETWORKS[networkIndex].chainId) });
    await get().refresh();
  },
  refresh: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    const entries = await Promise.all(
      get().assets.map(async (asset) => {
        const member = await wallet
          .lstStaking(asset)
          .getPosition(wallet)
          .catch(() => null);
        return [asset, member] as const;
      })
    );
    set({ positions: Object.fromEntries(entries) });
  },
  enter: async (asset, amount) => {
    const { wallet, networkIndex } = useWalletStore.getState();
    const config = getLSTConfig(NETWORKS[networkIndex].chainId, asset);
    if (!wallet || !config || !amount.trim()) return false;
    set({ busyAsset: asset });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Stake ${asset}`, () =>
        wallet
          .lstStaking(asset)
          .enter(wallet, Amount.parse(amount, config.decimals, config.symbol))
      );
    if (tx) await get().refresh();
    set({ busyAsset: null });
    return !!tx;
  },
  exit: async (asset) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ busyAsset: asset });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Complete exit ${asset}`, () =>
        wallet.lstStaking(asset).exit(wallet)
      );
    if (tx) await get().refresh();
    set({ busyAsset: null });
  },
}));
