import "@walletconnect/react-native-compat";

import {
  createAppKit,
  solana,
  type AppKitNetwork,
  type Storage,
} from "@reown/appkit-react-native";
import { EthersAdapter } from "@reown/appkit-ethers-react-native";
import { SolanaAdapter } from "@reown/appkit-solana-react-native";
import { sepolia, mainnet } from "viem/chains";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse, safeJsonStringify } from "@walletconnect/safe-json";

const storage: Storage = {
  getKeys: async () => {
    return (await AsyncStorage.getAllKeys()) as string[];
  },
  getEntries: async <T = unknown>(): Promise<[string, T][]> => {
    const keys = await AsyncStorage.getAllKeys();
    return await Promise.all(
      keys.map(async (key) => [
        key,
        safeJsonParse((await AsyncStorage.getItem(key)) ?? "") as T,
      ])
    );
  },
  setItem: async <T = unknown>(key: string, value: T) => {
    await AsyncStorage.setItem(key, safeJsonStringify(value));
  },
  getItem: async <T = unknown>(key: string): Promise<T | undefined> => {
    const item = await AsyncStorage.getItem(key);
    if (typeof item === "undefined" || item === null) {
      return undefined;
    }

    return safeJsonParse(item) as T;
  },
  removeItem: async (key: string) => {
    await AsyncStorage.removeItem(key);
  },
};

const solanaDevnet: AppKitNetwork = {
  id: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  name: "Solana Devnet",
  chainNamespace: "solana",
  caipNetworkId: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  nativeCurrency: solana.nativeCurrency,
  rpcUrls: {
    default: { http: ["https://api.devnet.solana.com"] },
  },
  blockExplorers: {
    default: {
      name: "Solana Devnet Explorer",
      url: "https://explorer.solana.com/?cluster=devnet",
    },
  },
};

const REOWN_PROJECT_ID = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID || "";

const ethersAdapter = new EthersAdapter();
const solanaAdapter = new SolanaAdapter();

export const appKit = createAppKit({
  projectId: REOWN_PROJECT_ID!,
  networks: [mainnet, sepolia, solana, solanaDevnet],
  adapters: [ethersAdapter, solanaAdapter],
  storage,
  metadata: {
    name: "Starkzap",
    description: "Bring Bitcoin, Stablecoins, and DeFi in your app in minutes",
    url: "https://starkzap.io/",
    icons: ["https://starkzap.io/logo.png"],
    redirect: {
      native: "mobile://",
    },
  },
  features: {
    swaps: false,
    onramp: false,
    socials: false,
  },
  debug: true,
});
