import "@walletconnect/react-native-compat";
import { type ReactNode } from "react";
import {
  createAppKit,
  solana,
  solanaTestnet,
  solanaDevnet,
  AppKit,
  AppKitProvider,
  type Storage,
} from "@reown/appkit-react-native";
import { EthersAdapter } from "@reown/appkit-ethers-react-native";
import {
  SolanaAdapter,
  PhantomConnector,
  SolflareConnector,
} from "@reown/appkit-solana-react-native";
import { mainnet, sepolia } from "viem/chains";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse, safeJsonStringify } from "@walletconnect/safe-json";
import { REOWN_PROJECT_ID } from "@/core/config";

// NOTE: this module pulls native WalletConnect/Reown modules absent from Expo
// Go. It is loaded ONLY in dev/custom builds (see app/_layout.tsx) so Expo Go
// never evaluates it.

const storage: Storage = {
  getKeys: async () => (await AsyncStorage.getAllKeys()) as string[],
  getEntries: async <T = unknown,>(): Promise<[string, T][]> => {
    const keys = await AsyncStorage.getAllKeys();
    return await Promise.all(
      keys.map(
        async (key) =>
          [
            key,
            safeJsonParse((await AsyncStorage.getItem(key)) ?? "") as T,
          ] as [string, T]
      )
    );
  },
  setItem: async (key, value) => {
    await AsyncStorage.setItem(key, safeJsonStringify(value));
  },
  getItem: async <T = unknown,>(key: string) => {
    const item = await AsyncStorage.getItem(key);
    if (item == null) return undefined;
    return safeJsonParse(item) as T;
  },
  removeItem: async (key) => {
    await AsyncStorage.removeItem(key);
  },
};

export const appKit = createAppKit({
  projectId: REOWN_PROJECT_ID,
  networks: [mainnet, sepolia, solana, solanaTestnet, solanaDevnet],
  adapters: [new EthersAdapter(), new SolanaAdapter()],
  extraConnectors: [
    new PhantomConnector({ cluster: "mainnet-beta" }),
    new PhantomConnector({ cluster: "testnet" }),
    new PhantomConnector({ cluster: "devnet" }),
    new SolflareConnector({ cluster: "mainnet-beta" }),
    new SolflareConnector({ cluster: "testnet" }),
    new SolflareConnector({ cluster: "devnet" }),
  ],
  storage,
  metadata: {
    name: "Starkzap",
    description: "Starknet onboarding, transfers, DeFi and bridging.",
    url: "https://starkzap.io/",
    icons: ["https://starkzap.io/logo.png"],
    redirect: { native: "starkzap://" },
  },
  features: { swaps: false, onramp: false, socials: false },
});

export function AppKitHost({ children }: { children: ReactNode }) {
  return (
    <AppKitProvider instance={appKit}>
      {children}
      <AppKit />
    </AppKitProvider>
  );
}
