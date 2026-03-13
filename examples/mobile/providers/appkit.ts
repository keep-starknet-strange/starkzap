import "@walletconnect/react-native-compat";

import {
  createAppKit,
  solana,
  solanaTestnet,
  type Storage,
} from "@reown/appkit-react-native";
import { EthersAdapter } from "@reown/appkit-ethers-react-native";
import {
  PhantomConnector,
  SolanaAdapter,
  SolflareConnector,
} from "@reown/appkit-solana-react-native";
import { mainnet, sepolia } from "viem/chains";
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

const REOWN_PROJECT_ID = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID || "";

const ethersAdapter = new EthersAdapter();
const solanaAdapter = new SolanaAdapter();

export const appKit = createAppKit({
  projectId: REOWN_PROJECT_ID!,
  networks: [mainnet, sepolia, solana, solanaTestnet],
  adapters: [ethersAdapter, solanaAdapter],
  extraConnectors: [
    new PhantomConnector({ cluster: "mainnet-beta" }),
    new PhantomConnector({ cluster: "testnet" }),
    new SolflareConnector({ cluster: "mainnet-beta" }),
    new SolflareConnector({ cluster: "testnet" }),
  ],
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
