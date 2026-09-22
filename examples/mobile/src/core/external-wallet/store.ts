import { create } from "zustand";
import type {
  ConnectedEthereumWallet,
  ConnectedSolanaWallet,
} from "starkzap-native";

// Connected external (source-chain) wallets, produced from Reown AppKit by the
// bridge screen. Kept out of the AppKit module so any code can read them.
interface ExternalWalletStore {
  eth: ConnectedEthereumWallet | null;
  sol: ConnectedSolanaWallet | null;
  setEth: (wallet: ConnectedEthereumWallet | null) => void;
  setSol: (wallet: ConnectedSolanaWallet | null) => void;
}

export const useExternalWalletStore = create<ExternalWalletStore>((set) => ({
  eth: null,
  sol: null,
  setEth: (eth) => set({ eth }),
  setSol: (sol) => set({ sol }),
}));
