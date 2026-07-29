import { create } from "zustand";
import { useWalletStore } from "@/core/wallet/store";

interface SettingsStore {
  /** The paymaster pays the gas, so the user pays nothing. */
  sponsored: boolean;
  setSponsored: (sponsored: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  sponsored: false,
  setSponsored: (sponsored) => set({ sponsored }),
}));

/**
 * Whether sponsorship can be offered at all. The SDK only gets a paymaster when
 * a proxy URL resolved for the connected network, so this follows the wallet
 * rather than being fixed at startup.
 */
export function useSponsoredAvailable(): boolean {
  return useWalletStore((s) => s.paymasterNodeUrl !== null);
}

/** Fee options for a transaction, or undefined to let the user pay. */
export function feeOptions(): { feeMode: "sponsored" } | undefined {
  const available = useWalletStore.getState().paymasterNodeUrl !== null;
  return available && useSettingsStore.getState().sponsored
    ? { feeMode: "sponsored" }
    : undefined;
}
