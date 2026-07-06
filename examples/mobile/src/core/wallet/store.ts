// Eagerly bundle the Avnu SDK so starkzap's lazy import("@avnu/avnu-sdk")
// resolves to the same copy at runtime (see the pin in metro.config.js).
import "@avnu/avnu-sdk";
import { create } from "zustand";
import * as Linking from "expo-linking";
import {
  ArgentPreset,
  BraavosPreset,
  DevnetPreset,
  OpenZeppelinPreset,
  OnboardStrategy,
  StarkSigner,
  StarkZap,
  EkuboSwapProvider,
  EkuboDcaProvider,
  AvnuSwapProvider,
  AvnuDcaProvider,
  type AccountClassConfig,
  type CartridgePolicies,
  type WalletInterface,
} from "starkzap-native";
import { NETWORKS } from "@/core/network";
import {
  PRIVY_SERVER_URL,
  PAYMASTER_PROXY_URL,
  LAYERSWAP_API_KEY_MAINNET,
  LAYERSWAP_API_KEY_TESTNET,
  SOLANA_RPC_URL,
  OFT_PUBLIC_KEY,
  alchemyEthRpc,
  alchemySolanaMainnetRpc,
} from "@/core/config";
import { resolveExamplePaymasterNodeUrl } from "@/core/paymaster";
import { ensureCartridgeAdapter } from "@/core/cartridge";
import { useTokensStore } from "@/core/tokens/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import { usePrivacyStore } from "@/features/privacy/store";

export type WalletType = "cartridge" | "privatekey" | "privy";

// Swap + DCA providers. Ekubo is fetch-only; Avnu needs @avnu/avnu-sdk (added
// as a dep). Both are registered so the user can pick per swap/order; Ekubo is
// the default.
const PROVIDER_OPTIONS = {
  swapProviders: [new EkuboSwapProvider(), new AvnuSwapProvider()],
  defaultSwapProviderId: "ekubo",
  dcaProviders: [new EkuboDcaProvider(), new AvnuDcaProvider()],
  defaultDcaProviderId: "ekubo",
};

// Provider ids for the swap/DCA selectors.
export const PROVIDER_OPTIONS_LIST = [
  { label: "Ekubo", value: "ekubo" },
  { label: "Avnu", value: "avnu" },
];

export const LOGIN_LABEL: Record<WalletType, string> = {
  cartridge: "Cartridge",
  privatekey: "Private key",
  privy: "Privy",
};

// Labels shown in the UI mapped to their account class implementations.
export const ACCOUNT_PRESETS: Record<string, AccountClassConfig> = {
  Ready: ArgentPreset,
  OpenZeppelin: OpenZeppelinPreset,
  Braavos: BraavosPreset,
  Devnet: DevnetPreset,
};

// STRK has the same address on Mainnet and Sepolia.
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Minimal Cartridge session scope for the demo: allow spending STRK.
// Expand this as later features (swap, staking, …) need more entrypoints.
const CARTRIDGE_POLICIES: CartridgePolicies = [
  { target: STRK_ADDRESS, method: "transfer" },
  { target: STRK_ADDRESS, method: "approve" },
];

interface WalletStore {
  networkIndex: number;
  sdk: StarkZap | null;
  paymasterNodeUrl: string | null;
  wallet: WalletInterface | null;
  walletType: WalletType | null;
  address: string | null;
  isDeployed: boolean | null;
  connecting: boolean;
  error: string | null;

  setNetworkIndex: (index: number) => void;
  connectCartridge: () => Promise<void>;
  connectPrivateKey: (
    privateKey: string,
    presetName: string,
    sponsored: boolean
  ) => Promise<void>;
  connectPrivy: (params: {
    walletId: string;
    publicKey: string;
    accessToken: string;
    presetName: string;
  }) => Promise<void>;
  checkDeployment: () => Promise<void>;
  deploy: () => Promise<void>;
  disconnect: () => void;
}

function buildSdk(networkIndex: number) {
  const net = NETWORKS[networkIndex];
  const paymasterNodeUrl = resolveExamplePaymasterNodeUrl({
    explicitProxyUrl: PAYMASTER_PROXY_URL,
    privyServerUrl: PRIVY_SERVER_URL,
    chainId: net.chainId.toLiteral(),
  });
  const isMain = net.chainId.isMainnet();
  const ethRpc = alchemyEthRpc(isMain ? "mainnet" : "sepolia");
  // Solana override wins; else Alchemy (mainnet only).
  const solanaRpc = SOLANA_RPC_URL || (isMain ? alchemySolanaMainnetRpc() : "");
  const layerswapApiKey = isMain
    ? LAYERSWAP_API_KEY_MAINNET
    : LAYERSWAP_API_KEY_TESTNET;
  const bridging = {
    ...(ethRpc ? { ethereumRpcUrl: ethRpc } : {}),
    ...(solanaRpc ? { solanaRpcUrl: solanaRpc } : {}),
    ...(layerswapApiKey ? { layerswapApiKey } : {}),
    // OFT is mainnet-only.
    ...(isMain && OFT_PUBLIC_KEY ? { layerZeroApiKey: OFT_PUBLIC_KEY } : {}),
  };
  const sdk = new StarkZap({
    rpcUrl: net.rpcUrl,
    chainId: net.chainId,
    ...(paymasterNodeUrl ? { paymaster: { nodeUrl: paymasterNodeUrl } } : {}),
    ...(Object.keys(bridging).length ? { bridging } : {}),
  });
  return { sdk, paymasterNodeUrl };
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  networkIndex: 0,
  sdk: null,
  paymasterNodeUrl: null,
  wallet: null,
  walletType: null,
  address: null,
  isDeployed: null,
  connecting: false,
  error: null,

  setNetworkIndex: (index) => {
    useTokensStore.getState().load(index);
    set({ networkIndex: index });
  },

  connectCartridge: async () => {
    ensureCartridgeAdapter();
    set({ connecting: true, error: null });
    try {
      const { sdk, paymasterNodeUrl } = buildSdk(get().networkIndex);
      const { wallet } = await sdk.onboard({
        strategy: OnboardStrategy.Cartridge,
        deploy: "never",
        ...PROVIDER_OPTIONS,
        cartridge: {
          policies: CARTRIDGE_POLICIES,
          // Redirect to the app root: Cartridge sends the browser back to this
          // deep link, and expo-router would 404 on any path that isn't a real
          // route (e.g. "/cartridge"). The session is read from the callback
          // (or the adapter's polling fallback), then we redirect to /home.
          redirectUrl: Linking.createURL("/"),
        },
      });
      set({
        sdk,
        paymasterNodeUrl,
        wallet,
        walletType: "cartridge",
        address: wallet.address,
      });
      usePrivacyStore.getState().clear();
      await get().checkDeployment();
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ connecting: false });
    }
  },

  connectPrivateKey: async (privateKey, presetName, sponsored) => {
    set({ connecting: true, error: null });
    try {
      const { sdk, paymasterNodeUrl } = buildSdk(get().networkIndex);
      const signer = new StarkSigner(privateKey.trim());
      const { wallet } = await sdk.onboard({
        strategy: OnboardStrategy.Signer,
        deploy: "never",
        ...PROVIDER_OPTIONS,
        account: { signer },
        accountPreset: ACCOUNT_PRESETS[presetName],
        ...(sponsored && paymasterNodeUrl
          ? { feeMode: "sponsored" as const }
          : {}),
      });
      set({
        sdk,
        paymasterNodeUrl,
        wallet,
        walletType: "privatekey",
        address: wallet.address,
      });
      // Establish the confidential capability now, while the key is in scope.
      usePrivacyStore.getState().init(privateKey.trim());
      await get().checkDeployment();
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ connecting: false });
    }
  },

  connectPrivy: async ({ walletId, publicKey, accessToken, presetName }) => {
    set({ connecting: true, error: null });
    try {
      const { sdk, paymasterNodeUrl } = buildSdk(get().networkIndex);
      const { wallet } = await sdk.onboard({
        strategy: OnboardStrategy.Privy,
        deploy: "never",
        ...PROVIDER_OPTIONS,
        accountPreset: ACCOUNT_PRESETS[presetName] ?? ACCOUNT_PRESETS.Ready,
        // The wallet signs remotely through the example server's Privy route,
        // authenticated with the access token from the Privy login.
        privy: {
          resolve: async () => ({
            walletId,
            publicKey,
            serverUrl: `${PRIVY_SERVER_URL}/api/wallet/sign`,
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        },
      });
      set({
        sdk,
        paymasterNodeUrl,
        wallet,
        walletType: "privy",
        address: wallet.address,
      });
      usePrivacyStore.getState().clear();
      await get().checkDeployment();
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ connecting: false });
    }
  },

  checkDeployment: async () => {
    const { wallet } = get();
    if (!wallet) return;
    try {
      const deployed = await wallet.isDeployed();
      if (get().wallet === wallet) set({ isDeployed: deployed });
    } catch {
      // leave deployment status unknown
    }
  },

  deploy: async () => {
    const { wallet } = get();
    if (!wallet) return;
    set({ connecting: true, error: null });
    const tx = await useTxBannerStore
      .getState()
      .notify("Deploy account", () => wallet.deploy());
    if (tx) await get().checkDeployment();
    set({ connecting: false });
  },

  disconnect: () => {
    usePrivacyStore.getState().clear();
    set({
      sdk: null,
      paymasterNodeUrl: null,
      wallet: null,
      walletType: null,
      address: null,
      isDeployed: null,
      error: null,
    });
  },
}));
