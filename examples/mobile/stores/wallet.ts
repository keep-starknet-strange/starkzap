import { create } from "zustand";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  type AccountClassConfig,
  ArgentPreset,
  BraavosPreset,
  DevnetPreset,
  fromAddress,
  OpenZeppelinPreset,
  OnboardStrategy,
  type StakingConfig,
  StarkZap,
  StarkSigner,
  type WalletInterface,
  type ChainIdLiteral,
  ChainId,
} from "@starkzap/native";
import {
  showTransactionToast,
  updateTransactionToast,
  showCopiedToast,
} from "@/components/Toast";
import { getNetworkSelectionPatch } from "@/network-selection";

// Privy server URL - change this to your server URL
export const PRIVY_SERVER_URL = process.env.EXPO_PUBLIC_PRIVY_SERVER_URL ?? "";
const PAYMASTER_PROXY_URL =
  process.env.EXPO_PUBLIC_PAYMASTER_PROXY_URL ??
  (PRIVY_SERVER_URL
    ? `${PRIVY_SERVER_URL.replace(/\/$/, "")}/api/paymaster`
    : "");

/** Get explorer URL for a transaction hash */
function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl = chainId.isSepolia()
    ? "https://sepolia.voyager.online/tx"
    : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}

/** True if the error indicates deployment failed due to insufficient STRK (resource bounds exceed balance) */
function isInsufficientBalanceDeployError(err: unknown): boolean {
  const s = String(err);
  return (
    /exceed balance\s*\(0\)/i.test(s) ||
    (/Account validation failed/i.test(s) &&
      /Resources bounds/i.test(s) &&
      /balance/i.test(s))
  );
}

// Network configuration type
export interface NetworkConfig {
  name: string;
  chainId: ChainId;
  rpcUrl: string;
}

// Available network presets
export const NETWORKS: NetworkConfig[] = [
  {
    name: "Sepolia",
    chainId: ChainId.SEPOLIA,
    rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9",
  },
  {
    name: "Mainnet",
    chainId: ChainId.MAINNET,
    rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9",
  },
];

// Default network (index into NETWORKS array, or null for custom)
export const DEFAULT_NETWORK_INDEX = 0;

// Account presets
// Note: Braavos deployment requires special signature format (see BraavosPreset docs)
export const PRESETS: Record<string, AccountClassConfig> = {
  OpenZeppelin: OpenZeppelinPreset,
  Argent: ArgentPreset,
  Braavos: BraavosPreset,
  Devnet: DevnetPreset,
};

interface WalletState {
  // SDK configuration
  rpcUrl: string;
  chainId: ChainId;
  sdk: StarkZap | null;
  paymasterNodeUrl: string | null;
  isConfigured: boolean;
  selectedNetworkIndex: number | null; // null means custom

  // Form state for custom network
  customRpcUrl: string;
  customChainId: ChainId;

  // Form state
  privateKey: string;
  selectedPreset: string;

  // Privy state
  walletType: "privatekey" | "privy" | null;
  privyEmail: string;
  privySelectedPreset: string;
  privyWalletId: string | null;
  privyPublicKey: string | null;
  preferSponsored: boolean;
  setPreferSponsored: (value: boolean) => void;
  setPrivySelectedPreset: (preset: string) => void;

  // Wallet state
  wallet: WalletInterface | null;
  isDeployed: boolean | null;

  // Loading states
  isConnecting: boolean;
  isCheckingStatus: boolean;

  // Logs
  logs: string[];

  // Network configuration actions
  selectNetwork: (index: number) => void;
  selectCustomNetwork: () => void;
  setCustomRpcUrl: (url: string) => void;
  setCustomChainId: (chainId: ChainIdLiteral) => void;
  confirmNetworkConfig: () => void;
  switchNetwork: (index: number, accessToken?: string) => Promise<void>;
  resetNetworkConfig: () => void;

  // Actions
  setPrivateKey: (key: string) => void;
  setSelectedPreset: (preset: string) => void;
  addLog: (message: string) => void;
  clearLogs: () => void;
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
}

const truncateAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const defaultNetwork = NETWORKS[DEFAULT_NETWORK_INDEX];

/** Register account address with backend for persistence (Privy flow) */
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

interface ConfiguredSdkState {
  sdk: StarkZap;
  paymasterNodeUrl: string | null;
  rpcUrl: string;
  chainId: ChainId;
}

function getStakingConfig(chainId: ChainId): StakingConfig | undefined {
  if (chainId.isMainnet()) {
    return {
      contract: fromAddress(
        "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7"
      ),
    };
  }

  if (chainId.isSepolia()) {
    return {
      contract: fromAddress(
        "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
      ),
    };
  }

  return undefined;
}

function createConfiguredSdkState(params: {
  rpcUrl: string;
  chainId: ChainId;
}): ConfiguredSdkState {
  const paymasterNodeUrl = PAYMASTER_PROXY_URL.trim() || null;
  const stakingConfig = getStakingConfig(params.chainId);
  const sdk = new StarkZap({
    rpcUrl: params.rpcUrl,
    chainId: params.chainId,
    ...(paymasterNodeUrl && {
      paymaster: { nodeUrl: paymasterNodeUrl },
    }),
    ...(stakingConfig ? { staking: stakingConfig } : {}),
  });

  return {
    sdk,
    paymasterNodeUrl,
    rpcUrl: params.rpcUrl,
    chainId: params.chainId,
  };
}

async function onboardPrivateKeyWallet(params: {
  sdk: StarkZap;
  privateKey: string;
  selectedPreset: string;
  preferSponsored: boolean;
}): Promise<WalletInterface> {
  const signer = new StarkSigner(params.privateKey.trim());
  const onboard = await params.sdk.onboard({
    strategy: OnboardStrategy.Signer,
    deploy: "never",
    ...(params.preferSponsored && { feeMode: "sponsored" as const }),
    account: { signer },
    accountPreset: PRESETS[params.selectedPreset],
  });

  return onboard.wallet;
}

async function onboardPrivyWallet(params: {
  sdk: StarkZap;
  walletId: string;
  publicKey: string;
  accessToken: string;
  privySelectedPreset: string;
  preferSponsored: boolean;
}): Promise<WalletInterface> {
  const onboard = await params.sdk.onboard({
    strategy: OnboardStrategy.Privy,
    deploy: "never",
    ...(params.preferSponsored && { feeMode: "sponsored" as const }),
    accountPreset: PRESETS[params.privySelectedPreset],
    privy: {
      resolve: async () => ({
        walletId: params.walletId,
        publicKey: params.publicKey,
        serverUrl: `${PRIVY_SERVER_URL}/api/wallet/sign`,
        headers: { Authorization: `Bearer ${params.accessToken}` },
      }),
    },
  });

  return onboard.wallet;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  // SDK configuration - starts unconfigured
  rpcUrl: defaultNetwork.rpcUrl,
  chainId: defaultNetwork.chainId,
  sdk: null,
  paymasterNodeUrl: null,
  isConfigured: false,
  selectedNetworkIndex: DEFAULT_NETWORK_INDEX,

  // Custom network form state
  customRpcUrl: "",
  customChainId: ChainId.SEPOLIA,

  // Initial state
  privateKey: "",
  selectedPreset: "Argent",

  // Privy state
  walletType: null,
  privyEmail: "",
  privySelectedPreset: "Argent",
  privyWalletId: null,
  privyPublicKey: null,
  preferSponsored: false,
  setPreferSponsored: (value) => set({ preferSponsored: value }),
  setPrivySelectedPreset: (preset) => set({ privySelectedPreset: preset }),

  wallet: null,
  isDeployed: null,
  isConnecting: false,
  isCheckingStatus: false,
  logs: [],

  // Network configuration actions
  selectNetwork: (index) =>
    set((state) => {
      const patch = getNetworkSelectionPatch({
        index,
        isConfigured: state.isConfigured,
        network: NETWORKS[index],
      });

      return patch ?? {};
    }),

  selectCustomNetwork: () => {
    set({ selectedNetworkIndex: null });
  },

  setCustomRpcUrl: (url) => set({ customRpcUrl: url }),

  setCustomChainId: (chainId) => set({ customChainId: ChainId.from(chainId) }),

  confirmNetworkConfig: () => {
    const { selectedNetworkIndex, customRpcUrl, customChainId, addLog } = get();

    let rpcUrl: string;
    let chainId: ChainId;

    if (selectedNetworkIndex !== null) {
      const network = NETWORKS[selectedNetworkIndex];
      rpcUrl = network.rpcUrl;
      chainId = network.chainId;
    } else {
      // Custom network
      if (!customRpcUrl.trim()) {
        Alert.alert("Error", "Please enter a valid RPC URL");
        return;
      }
      rpcUrl = customRpcUrl.trim();
      chainId = customChainId;
    }

    const configuredSdkState = createConfiguredSdkState({ rpcUrl, chainId });
    set({
      ...configuredSdkState,
      isConfigured: true,
      logs: [
        `SDK configured with ${selectedNetworkIndex !== null ? NETWORKS[selectedNetworkIndex].name : "Custom Network"}`,
      ],
    });
    addLog(`RPC: ${rpcUrl}`);
    addLog(`Chain: ${chainId.toLiteral()}`);
    if (configuredSdkState.paymasterNodeUrl) {
      addLog(`Paymaster: ${configuredSdkState.paymasterNodeUrl}`);
    } else {
      addLog("Paymaster: disabled");
    }
  },

  switchNetwork: async (index, accessToken) => {
    const state = get();
    const nextNetwork = NETWORKS[index];

    if (!nextNetwork) {
      throw new Error("Unknown network selection");
    }

    if (
      state.chainId.toLiteral() === nextNetwork.chainId.toLiteral() &&
      state.selectedNetworkIndex === index
    ) {
      return;
    }

    set({ isConnecting: true });
    state.addLog(`Switching network to ${nextNetwork.name}...`);

    try {
      const configuredSdkState = createConfiguredSdkState({
        rpcUrl: nextNetwork.rpcUrl,
        chainId: nextNetwork.chainId,
      });

      let nextWallet = state.wallet;
      if (state.walletType === "privatekey") {
        if (!state.privateKey.trim()) {
          throw new Error(
            "Private key session is unavailable. Reconnect the wallet first."
          );
        }

        nextWallet = await onboardPrivateKeyWallet({
          sdk: configuredSdkState.sdk,
          privateKey: state.privateKey,
          selectedPreset: state.selectedPreset,
          preferSponsored: state.preferSponsored,
        });
      } else if (state.walletType === "privy") {
        if (!state.privyWalletId || !state.privyPublicKey || !accessToken) {
          throw new Error(
            "Privy session is unavailable. Log in again before switching networks."
          );
        }

        nextWallet = await onboardPrivyWallet({
          sdk: configuredSdkState.sdk,
          walletId: state.privyWalletId,
          publicKey: state.privyPublicKey,
          accessToken,
          privySelectedPreset: state.privySelectedPreset,
          preferSponsored: state.preferSponsored,
        });
      }

      set({
        ...configuredSdkState,
        selectedNetworkIndex: index,
        isConfigured: true,
        wallet: nextWallet,
        isDeployed: null,
      });
      get().addLog(`Switched to ${nextNetwork.name}`);
      get().addLog(`RPC: ${configuredSdkState.rpcUrl}`);
      get().addLog(`Chain: ${configuredSdkState.chainId.toLiteral()}`);

      if (nextWallet) {
        await get().checkDeploymentStatus();
      }
    } catch (error) {
      get().addLog(`Network switch failed: ${error}`);
      throw error;
    } finally {
      set({ isConnecting: false });
    }
  },

  resetNetworkConfig: () => {
    const { addLog } = get();
    set({
      sdk: null,
      paymasterNodeUrl: null,
      isConfigured: false,
      wallet: null,
      walletType: null,
      isDeployed: null,
      privateKey: "",
      privyEmail: "",
      privyWalletId: null,
      privyPublicKey: null,
      selectedNetworkIndex: DEFAULT_NETWORK_INDEX,
      rpcUrl: defaultNetwork.rpcUrl,
      chainId: defaultNetwork.chainId,
    });
    addLog("Network configuration reset");
  },

  // Actions
  setPrivateKey: (key) => set({ privateKey: key }),

  setSelectedPreset: (preset) => set({ selectedPreset: preset }),

  addLog: (message) =>
    set((state) => ({
      logs: [...state.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
    })),

  clearLogs: () => set({ logs: [] }),

  connect: async () => {
    const { privateKey, selectedPreset, sdk, addLog, preferSponsored } = get();

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
      const connectedWallet = await onboardPrivateKeyWallet({
        sdk,
        privateKey,
        selectedPreset,
        preferSponsored,
      });

      set({
        wallet: connectedWallet,
        walletType: "privatekey",
        privyWalletId: null,
        privyPublicKey: null,
      });
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
    const { privySelectedPreset, sdk, addLog, preferSponsored } = get();

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
      const connectedWallet = await onboardPrivyWallet({
        sdk,
        walletId,
        publicKey,
        accessToken,
        privySelectedPreset,
        preferSponsored,
      });

      set({
        wallet: connectedWallet,
        walletType: "privy",
        privyWalletId: walletId,
        privyPublicKey: publicKey,
      });
      addLog(`Connected: ${truncateAddress(connectedWallet.address)}`);

      await registerAccount(
        privySelectedPreset,
        connectedWallet.address,
        accessToken
      );

      await get().checkDeploymentStatus();
    } catch (err) {
      addLog(`Privy connection failed: ${err}`);
      Alert.alert("Connection Failed", String(err));
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: () => {
    const { addLog } = get();
    set({
      wallet: null,
      walletType: null,
      isDeployed: null,
      privateKey: "",
      privyEmail: "",
      privyWalletId: null,
      privyPublicKey: null,
    });
    addLog("Disconnected");
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
    const { wallet, chainId, addLog, checkDeploymentStatus } = get();
    if (!wallet) return;

    set({ isConnecting: true });
    addLog("Deploying account...");

    try {
      const tx = await wallet.deploy();
      addLog(`Deploy tx submitted: ${truncateAddress(tx.hash)}`);

      // Show pending toast
      showTransactionToast(
        {
          txHash: tx.hash,
          title: "Deploying Account",
          subtitle: "Deploying your account contract on-chain",
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      // Update toast to success
      updateTransactionToast({
        txHash: tx.hash,
        title: "Account Deployed",
        subtitle: "Your account is now deployed on-chain",
        explorerUrl: getExplorerUrl(tx.hash, chainId),
      });

      addLog("Account deployed successfully!");
      await checkDeploymentStatus();
    } catch (err) {
      const errStr = String(err);
      addLog(`Deployment failed: ${errStr}`);

      const isInsufficientBalance = isInsufficientBalanceDeployError(err);
      const message = isInsufficientBalance
        ? "Deployment requires STRK to pay for gas. Your account balance is too low.\n\n" +
          (chainId.isSepolia()
            ? "On Sepolia testnet, test STRK are available to claim from the Balances tab (Claim test STRK)."
            : "Please fund your account with STRK and try again.")
        : errStr;

      Alert.alert("Deployment Failed", message, [
        {
          text: "Copy",
          onPress: async () => {
            await Clipboard.setStringAsync(errStr);
            showCopiedToast();
          },
        },
        { text: "OK" },
      ]);
    } finally {
      set({ isConnecting: false });
    }
  },
}));
