import { create } from "zustand";
import { Alert } from "react-native";
import {
  StarkSDK,
  StarkSigner,
  PrivySigner,
  OpenZeppelinPreset,
  ArgentPreset,
  ArgentXV050Preset,
  BraavosPreset,
  DevnetPreset,
  Amount,
  getErc20,
  networks,
  type NetworkPreset,
  type WalletInterface,
  type AccountClassConfig,
  type ChainId,
  type ExecuteOptions,
} from "x";

// Privy server URL - change this to your server URL
// For Expo Go: use your machine's local IP (not localhost)
export const PRIVY_SERVER_URL = "http://192.168.1.222:3001";

// Available networks (using SDK presets)
export const NETWORKS: { name: string; preset: NetworkPreset }[] = [
  { name: "Sepolia", preset: networks.sepolia },
  { name: "Mainnet", preset: networks.mainnet },
];

// Default network (index into NETWORKS array, or null for custom)
export const DEFAULT_NETWORK_INDEX = 0;

// Account presets
export const PRESETS: Record<string, AccountClassConfig> = {
  OpenZeppelin: OpenZeppelinPreset,
  Argent: ArgentPreset,
  "ArgentX v0.5": ArgentXV050Preset,
  Braavos: BraavosPreset,
  Devnet: DevnetPreset,
};

// Wallet connection type
type WalletType = "privatekey" | "privy";

interface WalletState {
  // SDK configuration
  rpcUrl: string;
  chainId: ChainId;
  sdk: StarkSDK | null;
  isConfigured: boolean;
  selectedNetworkIndex: number | null; // null means custom

  // Form state for custom network
  customRpcUrl: string;
  customChainId: ChainId;

  // Form state
  privateKey: string;
  selectedPreset: string;

  // Privy form state
  privyEmail: string;
  privySelectedPreset: string;
  privyWalletId: string | null;

  // Paymaster state
  useSponsored: boolean;
  setUseSponsored: (value: boolean) => void;

  // Wallet state
  wallet: WalletInterface | null;
  walletType: WalletType | null;
  isDeployed: boolean | null;

  // Loading states
  isConnecting: boolean;
  isCheckingStatus: boolean;
  isTransferring: boolean;

  // Logs
  logs: string[];

  // Network configuration actions
  selectNetwork: (index: number) => void;
  selectCustomNetwork: () => void;
  setCustomRpcUrl: (url: string) => void;
  setCustomChainId: (chainId: ChainId) => void;
  confirmNetworkConfig: () => void;
  resetNetworkConfig: () => void;

  // Actions
  setPrivateKey: (key: string) => void;
  setSelectedPreset: (preset: string) => void;
  setPrivySelectedPreset: (preset: string) => void;
  addLog: (message: string) => void;
  connect: () => Promise<void>;
  connectWithPrivy: (
    walletId: string,
    publicKey: string,
    email: string,
    accessToken: string
  ) => Promise<void>;
  disconnect: () => void;
  checkDeploymentStatus: () => Promise<void>;
  deploy: () => Promise<void>;
  testTransfer: () => Promise<void>;
}

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

const defaultNetwork = NETWORKS[DEFAULT_NETWORK_INDEX];

/** Register account address with backend for persistence */
async function registerAccount(
  preset: string,
  address: string,
  token: string
): Promise<void> {
  try {
    await fetch(`${PRIVY_SERVER_URL}/api/wallet/register-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preset, address, deployed: false }),
    });
  } catch (err) {
    console.warn("Failed to register account:", err);
  }
}

export const useWalletStore = create<WalletState>((set, get) => ({
  // SDK configuration - starts unconfigured
  rpcUrl: defaultNetwork.preset.rpcUrl,
  chainId: defaultNetwork.preset.chainId,
  sdk: null,
  isConfigured: false,
  selectedNetworkIndex: DEFAULT_NETWORK_INDEX,

  // Custom network form state
  customRpcUrl: "",
  customChainId: "SN_SEPOLIA",

  // Initial state
  privateKey: "",
  selectedPreset: "OpenZeppelin",

  // Privy state
  privyEmail: "",
  privySelectedPreset: "Argent",
  privyWalletId: null,

  // Paymaster state
  useSponsored: false,

  // Wallet state
  wallet: null,
  walletType: null,
  isDeployed: null,
  isConnecting: false,
  isCheckingStatus: false,
  isTransferring: false,
  logs: [],

  // Network configuration actions
  selectNetwork: (index) => {
    const network = NETWORKS[index];
    if (network) {
      set({
        selectedNetworkIndex: index,
        rpcUrl: network.preset.rpcUrl,
        chainId: network.preset.chainId,
      });
    }
  },

  selectCustomNetwork: () => {
    set({ selectedNetworkIndex: null });
  },

  setCustomRpcUrl: (url) => set({ customRpcUrl: url }),

  setCustomChainId: (chainId) => set({ customChainId: chainId }),

  setUseSponsored: (value) => set({ useSponsored: value }),

  confirmNetworkConfig: () => {
    const { selectedNetworkIndex, customRpcUrl, customChainId, addLog } = get();

    let newSdk: StarkSDK;
    let rpcUrl: string;
    let chainId: ChainId;

    if (selectedNetworkIndex !== null) {
      // Use SDK network preset
      const network = NETWORKS[selectedNetworkIndex];
      rpcUrl = network.preset.rpcUrl;
      chainId = network.preset.chainId;
      newSdk = new StarkSDK({
        network: network.preset,
        paymaster: { nodeUrl: `${PRIVY_SERVER_URL}/api/paymaster` },
      });
    } else {
      // Custom network
      if (!customRpcUrl.trim()) {
        Alert.alert("Error", "Please enter a valid RPC URL");
        return;
      }
      rpcUrl = customRpcUrl.trim();
      chainId = customChainId;
      newSdk = new StarkSDK({
        rpcUrl,
        chainId,
        paymaster: { nodeUrl: `${PRIVY_SERVER_URL}/api/paymaster` },
      });
    }

    set({
      sdk: newSdk,
      rpcUrl,
      chainId,
      isConfigured: true,
      logs: [
        `SDK configured with ${selectedNetworkIndex !== null ? NETWORKS[selectedNetworkIndex].name : "Custom Network"}`,
      ],
    });
    addLog(`RPC: ${rpcUrl}`);
    addLog(`Chain: ${chainId}`);
  },

  resetNetworkConfig: () => {
    const { addLog } = get();
    set({
      sdk: null,
      isConfigured: false,
      wallet: null,
      walletType: null,
      isDeployed: null,
      privateKey: "",
      privyEmail: "",
      privyWalletId: null,
      selectedNetworkIndex: DEFAULT_NETWORK_INDEX,
      rpcUrl: defaultNetwork.preset.rpcUrl,
      chainId: defaultNetwork.preset.chainId,
    });
    addLog("Network configuration reset");
  },

  // Actions
  setPrivateKey: (key) => set({ privateKey: key }),

  setSelectedPreset: (preset) => set({ selectedPreset: preset }),

  setPrivySelectedPreset: (preset) => set({ privySelectedPreset: preset }),

  addLog: (message) =>
    set((state) => ({
      logs: [...state.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
    })),

  connect: async () => {
    const { privateKey, selectedPreset, sdk, addLog } = get();

    if (!sdk) {
      Alert.alert(
        "Error",
        "SDK not configured. Please configure network first."
      );
      return;
    }

    if (!privateKey.trim()) {
      Alert.alert("Error", "Please enter a private key");
      return;
    }

    set({ isConnecting: true });
    addLog(`Connecting with ${selectedPreset} account...`);

    try {
      const signer = new StarkSigner(privateKey.trim());
      const connectedWallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: PRESETS[selectedPreset],
        },
      });

      set({ wallet: connectedWallet, walletType: "privatekey" });
      addLog(`Connected: ${truncateAddress(connectedWallet.address)}`);

      // Check deployment status after connecting
      await get().checkDeploymentStatus();
    } catch (err) {
      addLog(`Connection failed: ${err}`);
      Alert.alert("Connection Failed", String(err));
    } finally {
      set({ isConnecting: false });
    }
  },

  connectWithPrivy: async (
    walletId: string,
    publicKey: string,
    email: string,
    accessToken: string
  ) => {
    const { privySelectedPreset, sdk, addLog } = get();

    if (!sdk) {
      Alert.alert(
        "Error",
        "SDK not configured. Please configure network first."
      );
      return;
    }

    set({ isConnecting: true, privyEmail: email });
    addLog(`Connecting with Privy (${email})...`);

    try {
      set({ privyWalletId: walletId });

      const signer = new PrivySigner({
        walletId,
        publicKey,
        serverUrl: `${PRIVY_SERVER_URL}/api/wallet/sign`,
      });

      const connectedWallet = await sdk.connectWallet({
        account: {
          signer,
          accountClass: PRESETS[privySelectedPreset],
        },
      });

      set({ wallet: connectedWallet, walletType: "privy" });
      addLog(`Connected: ${truncateAddress(connectedWallet.address)}`);

      // Register account with backend for persistence
      await registerAccount(
        privySelectedPreset,
        connectedWallet.address,
        accessToken
      );

      // Check deployment status
      await get().checkDeploymentStatus();
    } catch (err) {
      addLog(`Privy connection failed: ${err}`);
      Alert.alert("Connection Failed", String(err));
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: () => {
    set({
      wallet: null,
      walletType: null,
      isDeployed: null,
      privateKey: "",
      privyEmail: "",
      privyWalletId: null,
    });
    get().addLog("Disconnected");
  },

  checkDeploymentStatus: async () => {
    const { wallet, addLog } = get();
    if (!wallet) return;

    set({ isCheckingStatus: true });
    try {
      const deployed = await wallet.isDeployed();
      set({ isDeployed: deployed });
      addLog(`Account is ${deployed ? "deployed ✓" : "not deployed"}`);
    } catch (err) {
      addLog(`Failed to check status: ${err}`);
    } finally {
      set({ isCheckingStatus: false });
    }
  },

  deploy: async () => {
    const { wallet, useSponsored, addLog, checkDeploymentStatus } = get();
    if (!wallet) return;

    set({ isConnecting: true });
    addLog(`Deploying account${useSponsored ? " (sponsored)..." : "..."}`);

    try {
      const tx = await wallet.deploy({
        feeMode: useSponsored ? "sponsored" : "user_pays",
      });
      addLog(`Deploy tx: ${truncateAddress(tx.hash)}`);
      await tx.wait();
      addLog("Account deployed!");
      await checkDeploymentStatus();
    } catch (err) {
      addLog(`Deployment failed: ${err}`);
      Alert.alert("Deployment Failed", String(err));
    } finally {
      set({ isConnecting: false });
    }
  },

  testTransfer: async () => {
    const { wallet, chainId, useSponsored, addLog } = get();
    if (!wallet) return;

    set({ isTransferring: true });
    addLog(`Test transfer (0 STRK)${useSponsored ? " sponsored..." : "..."}`);

    try {
      const strk = getErc20("STRK", chainId);
      const options: ExecuteOptions = useSponsored
        ? { feeMode: "sponsored" }
        : {};

      const tx = await strk.transfer({
        from: wallet,
        transfers: [
          { to: wallet.address, amount: Amount.parse("0", strk.token) },
        ],
        options,
      });

      addLog(`Tx: ${truncateAddress(tx.hash)}`);
      await tx.wait();
      addLog("Transfer confirmed!");
    } catch (err) {
      addLog(`Transfer failed: ${err}`);
      Alert.alert("Transfer Failed", String(err));
    } finally {
      set({ isTransferring: false });
    }
  },
}));
