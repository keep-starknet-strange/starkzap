import { create } from "zustand";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  type AccountClassConfig,
  Amount,
  ArgentPreset,
  BraavosPreset,
  BridgeDepositFeeEstimation,
  type BridgeToken,
  ChainId,
  type ChainIdLiteral,
  ConnectedEthereumWallet,
  ConnectedSolanaWallet,
  type ConnectExternalWalletOptions,
  DevnetPreset,
  Erc20,
  EthereumBridgeToken,
  ExternalChain,
  fromAddress,
  OnboardStrategy,
  OpenZeppelinPreset,
  SolanaBridgeToken,
  type StakingConfig,
  StarkSigner,
  StarkZap,
  type WalletInterface,
} from "@starkzap/native";
import {
  showCopiedToast,
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import {
  MAINNET_PAYMASTER_DISABLED_MESSAGE,
  resolveExamplePaymasterNodeUrl,
} from "@/constants/paymaster";
import { swapProviders } from "@/swaps";
import { getDcaProviders } from "@/dca";
import { getNetworkSelectionPatch } from "@/network-selection";

// Privy server URL - change this to your server URL
export const PRIVY_SERVER_URL = process.env.EXPO_PUBLIC_PRIVY_SERVER_URL ?? "";
const EXPLICIT_PAYMASTER_PROXY_URL =
  process.env.EXPO_PUBLIC_PAYMASTER_PROXY_URL ?? "";

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
  networkSwitchRequestId: number;

  // Logs
  logs: string[];

  // External wallet state (sourced from StarkZap SDK)
  connectedEthWallet: ConnectedEthereumWallet | undefined;
  connectedSolWallet: ConnectedSolanaWallet | undefined;

  // Bridge state
  bridgeDirection: "to-starknet" | "from-starknet";
  bridgeExternalChain: ExternalChain;
  bridgeSelectedToken: BridgeToken | null;
  bridgeDepositBalance: string | null;
  bridgeDepositBalanceUnit: string | null;
  bridgeDepositBalanceLoading: boolean;
  bridgeAllowance: string | null;
  bridgeAllowanceLoading: boolean;
  bridgeTokens: BridgeToken[];
  bridgeIsLoading: boolean;
  bridgeError: string | null;
  bridgeLastUpdated: Date | null;
  bridgeDepositFeeEstimate: BridgeDepositFeeEstimation | null;
  bridgeDepositFeeLoading: boolean;
  bridgeFastTransfer: boolean;

  // Network configuration actions
  selectNetwork: (index: number) => void;
  selectCustomNetwork: () => void;
  setCustomRpcUrl: (url: string) => void;
  setCustomChainId: (chainId: ChainIdLiteral) => void;
  confirmNetworkConfig: () => void;
  switchNetwork: (index: number, accessToken?: string) => Promise<void>;
  resetNetworkConfig: () => void;
  connectExternalWallet: (
    options: ConnectExternalWalletOptions
  ) => Promise<void>;
  disconnectExternalWallets: () => void;
  setBridgeExternalChain: (chain: ExternalChain) => void;
  toggleBridgeDirection: () => void;
  selectBridgeToken: (token: BridgeToken | null) => void;
  fetchBridgeTokens: () => Promise<void>;
  refreshBridgeTokens: () => Promise<void>;
  fetchBridgeDepositBalance: () => Promise<void>;
  fetchBridgeAllowance: () => Promise<void>;
  fetchBridgeDepositFeeEstimate: () => Promise<void>;
  setBridgeFastTransfer: (value: boolean) => void;
  initiateBridge: (amount: string) => Promise<void>;

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

function sameBridgeToken(
  left: BridgeToken | null,
  right: BridgeToken | null
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.id === right.id && left.chain === right.chain;
}

interface BridgeRequestSnapshot {
  sdk?: StarkZap | null;
  chainId: ChainId;
  bridgeDirection: "to-starknet" | "from-starknet";
  wallet: WalletInterface | null;
  connectedEthWallet: ConnectedEthereumWallet | undefined;
  connectedSolWallet: ConnectedSolanaWallet | undefined;
  bridgeSelectedToken: BridgeToken | null;
  bridgeExternalChain?: ExternalChain;
  bridgeFastTransfer?: boolean;
}

/**
 * Create a staleness guard for bridge async operations.
 * Returns a function that checks whether the store still matches
 * the snapshot captured at request time.
 */
function createBridgeRequestGuard(
  snapshot: BridgeRequestSnapshot,
  get: () => BridgeRequestSnapshot
): () => boolean {
  const chainLiteral = snapshot.chainId.toLiteral();
  return () => {
    const current = get();
    return (
      (snapshot.sdk === undefined || current.sdk === snapshot.sdk) &&
      current.chainId.toLiteral() === chainLiteral &&
      current.bridgeDirection === snapshot.bridgeDirection &&
      current.wallet === snapshot.wallet &&
      current.connectedEthWallet === snapshot.connectedEthWallet &&
      current.connectedSolWallet === snapshot.connectedSolWallet &&
      sameBridgeToken(
        current.bridgeSelectedToken,
        snapshot.bridgeSelectedToken
      ) &&
      (snapshot.bridgeFastTransfer == null ||
        current.bridgeFastTransfer === snapshot.bridgeFastTransfer)
    );
  };
}

function getBridgeResetState() {
  return {
    bridgeSelectedToken: null,
    bridgeDepositBalance: null,
    bridgeDepositBalanceUnit: null,
    bridgeDepositBalanceLoading: false,
    bridgeAllowance: null,
    bridgeAllowanceLoading: false,
    bridgeTokens: [],
    bridgeIsLoading: false,
    bridgeError: null,
    bridgeLastUpdated: null,
    bridgeDepositFeeEstimate: null,
    bridgeDepositFeeLoading: false,
    bridgeFastTransfer: false,
  } as const;
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
  const paymasterNodeUrl = resolveExamplePaymasterNodeUrl({
    explicitProxyUrl: EXPLICIT_PAYMASTER_PROXY_URL,
    privyServerUrl: PRIVY_SERVER_URL,
    chainId: params.chainId.toLiteral(),
  });
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
  const dcaProviders = getDcaProviders();
  const signer = new StarkSigner(params.privateKey.trim());
  const onboard = await params.sdk.onboard({
    strategy: OnboardStrategy.Signer,
    deploy: "never",
    ...(params.preferSponsored && { feeMode: "sponsored" as const }),
    account: { signer },
    accountPreset: PRESETS[params.selectedPreset],
    swapProviders,
    defaultSwapProviderId: swapProviders[0]?.id,
    dcaProviders,
    defaultDcaProviderId: dcaProviders[0]?.id,
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
  const dcaProviders = getDcaProviders();
  const onboard = await params.sdk.onboard({
    strategy: OnboardStrategy.Privy,
    deploy: "never",
    ...(params.preferSponsored && { feeMode: "sponsored" as const }),
    accountPreset: PRESETS[params.privySelectedPreset],
    swapProviders,
    defaultSwapProviderId: swapProviders[0]?.id,
    dcaProviders,
    defaultDcaProviderId: dcaProviders[0]?.id,
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

/**
 * Re-onboard the current wallet session against a new SDK instance
 * during a network switch. Returns the existing wallet when the
 * wallet type does not require re-onboarding.
 */
async function rebindWallet(
  state: WalletState,
  sdk: StarkZap,
  accessToken?: string
): Promise<WalletInterface | null> {
  if (state.walletType === "privatekey") {
    if (!state.privateKey.trim()) {
      throw new Error(
        "Private key session is unavailable. Reconnect the wallet first."
      );
    }
    return onboardPrivateKeyWallet({
      sdk,
      privateKey: state.privateKey,
      selectedPreset: state.selectedPreset,
      preferSponsored: state.preferSponsored,
    });
  }

  if (state.walletType === "privy") {
    if (!state.privyWalletId || !state.privyPublicKey || !accessToken) {
      throw new Error(
        "Privy session is unavailable. Log in again before switching networks."
      );
    }
    return onboardPrivyWallet({
      sdk,
      walletId: state.privyWalletId,
      publicKey: state.privyPublicKey,
      accessToken,
      privySelectedPreset: state.privySelectedPreset,
      preferSponsored: state.preferSponsored,
    });
  }

  return state.wallet;
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
  networkSwitchRequestId: 0,
  logs: [],
  connectedEthWallet: undefined,
  connectedSolWallet: undefined,
  bridgeDirection: "to-starknet",
  bridgeExternalChain: ExternalChain.ETHEREUM,
  bridgeSelectedToken: null,
  bridgeDepositBalance: null,
  bridgeDepositBalanceUnit: null,
  bridgeDepositBalanceLoading: false,
  bridgeAllowance: null,
  bridgeAllowanceLoading: false,
  bridgeTokens: [],
  bridgeIsLoading: false,
  bridgeError: null,
  bridgeLastUpdated: null,
  bridgeDepositFeeEstimate: null,
  bridgeDepositFeeLoading: false,
  bridgeFastTransfer: false,

  // Network configuration actions
  selectNetwork: (index) =>
    set((state) => {
      const patch = getNetworkSelectionPatch({
        index,
        isConfigured: state.isConfigured,
        network: NETWORKS[index],
      });

      if (!patch) {
        return {};
      }

      if (state.isConfigured) {
        return patch;
      }

      return {
        ...patch,
        bridgeSelectedToken: null,
        bridgeDepositBalance: null,
        bridgeDepositBalanceUnit: null,
        bridgeAllowance: null,
        bridgeTokens: [],
        bridgeError: null,
        bridgeLastUpdated: null,
        bridgeDepositFeeEstimate: null,
        bridgeDepositFeeLoading: false,
        bridgeFastTransfer: false,
      };
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
      ...getBridgeResetState(),
      logs: [
        `SDK configured with ${selectedNetworkIndex !== null ? NETWORKS[selectedNetworkIndex].name : "Custom Network"}`,
      ],
    });
    addLog(`RPC: ${rpcUrl}`);
    addLog(`Chain: ${chainId.toLiteral()}`);
    if (configuredSdkState.paymasterNodeUrl) {
      addLog(`Paymaster: ${configuredSdkState.paymasterNodeUrl}`);
    } else if (chainId.isMainnet()) {
      addLog(MAINNET_PAYMASTER_DISABLED_MESSAGE);
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

    const requestId = state.networkSwitchRequestId + 1;
    const isCurrentRequest = () => get().networkSwitchRequestId === requestId;

    set({ isConnecting: true, networkSwitchRequestId: requestId });
    state.addLog(`Switching network to ${nextNetwork.name}...`);

    try {
      const configuredSdkState = createConfiguredSdkState({
        rpcUrl: nextNetwork.rpcUrl,
        chainId: nextNetwork.chainId,
      });
      if (!isCurrentRequest()) return;

      const nextWallet = await rebindWallet(
        state,
        configuredSdkState.sdk,
        accessToken
      );
      if (!isCurrentRequest()) return;

      set({
        ...configuredSdkState,
        selectedNetworkIndex: index,
        isConfigured: true,
        wallet: nextWallet,
        isDeployed: null,
        ...getBridgeResetState(),
      });
      if (!isCurrentRequest()) return;

      await get().fetchBridgeTokens();
      if (!isCurrentRequest()) return;

      get().addLog(`Switched to ${nextNetwork.name}`);
      get().addLog(`RPC: ${configuredSdkState.rpcUrl}`);
      get().addLog(`Chain: ${configuredSdkState.chainId.toLiteral()}`);

      if (nextWallet) {
        await get().checkDeploymentStatus();
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      get().addLog(`Network switch failed: ${error}`);
      throw error;
    } finally {
      if (isCurrentRequest()) {
        set({ isConnecting: false });
      }
    }
  },

  resetNetworkConfig: () => {
    const { addLog, networkSwitchRequestId } = get();
    set({
      sdk: null,
      paymasterNodeUrl: null,
      isConfigured: false,
      isConnecting: false,
      isCheckingStatus: false,
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
      connectedEthWallet: undefined,
      connectedSolWallet: undefined,
      bridgeDirection: "to-starknet",
      bridgeExternalChain: ExternalChain.ETHEREUM,
      ...getBridgeResetState(),
      networkSwitchRequestId: networkSwitchRequestId + 1,
    });
    addLog("Network configuration reset");
  },

  connectExternalWallet: async (options: ConnectExternalWalletOptions) => {
    const { chainId, addLog } = get();

    try {
      if (options.chain === ExternalChain.ETHEREUM) {
        const wallet = await ConnectedEthereumWallet.from(options, chainId);
        set({ connectedEthWallet: wallet });
        addLog(
          `${options.chain} wallet connected: ${truncateAddress(wallet.address)}`
        );
      } else if (options.chain === ExternalChain.SOLANA) {
        const wallet = await ConnectedSolanaWallet.from(options, chainId);
        set({ connectedSolWallet: wallet });
        addLog(
          `${options.chain} wallet connected: ${truncateAddress(wallet.address)}`
        );
      }
    } catch (err) {
      addLog(`Failed to connect ${options.chain} wallet: ${err}`);
      throw err;
    }
  },

  disconnectExternalWallets: () => {
    const { addLog } = get();

    set({
      connectedEthWallet: undefined,
      connectedSolWallet: undefined,
    });
    addLog("External wallets disconnected");
  },

  setBridgeExternalChain: (chain) => {
    const { bridgeExternalChain } = get();
    if (bridgeExternalChain === chain) return;
    set({
      bridgeExternalChain: chain,
      ...getBridgeResetState(),
    });
  },

  toggleBridgeDirection: () => {
    set((state) => ({
      bridgeDirection:
        state.bridgeDirection === "to-starknet"
          ? "from-starknet"
          : "to-starknet",
      bridgeDepositBalance: null,
      bridgeDepositBalanceUnit: null,
      bridgeAllowance: null,
      bridgeDepositFeeEstimate: null,
      bridgeDepositFeeLoading: false,
      bridgeFastTransfer: false,
    }));
  },

  selectBridgeToken: (token) => {
    set({
      bridgeSelectedToken: token,
      bridgeDepositBalance: null,
      bridgeDepositBalanceUnit: null,
      bridgeAllowance: null,
      bridgeDepositFeeEstimate: null,
      bridgeDepositFeeLoading: false,
      bridgeFastTransfer: false,
    });
  },

  fetchBridgeTokens: async () => {
    const { sdk, bridgeExternalChain, chainId } = get();

    if (!sdk) {
      return;
    }

    const chainLiteral = chainId.toLiteral();
    const isCurrentRequest = () => {
      const current = get();
      return (
        current.sdk === sdk &&
        current.chainId.toLiteral() === chainLiteral &&
        current.bridgeExternalChain === bridgeExternalChain
      );
    };

    set({ bridgeIsLoading: true, bridgeError: null });

    try {
      const bridgeTokens = await sdk.getBridgingTokens(bridgeExternalChain);
      if (!isCurrentRequest()) {
        return;
      }

      set({
        bridgeTokens,
        bridgeIsLoading: false,
        bridgeError: null,
        bridgeLastUpdated: new Date(),
      });
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      set({
        bridgeIsLoading: false,
        bridgeError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshBridgeTokens: async () => {
    await get().fetchBridgeTokens();
  },

  fetchBridgeDepositBalance: async () => {
    const {
      sdk,
      bridgeSelectedToken,
      bridgeDirection,
      connectedEthWallet,
      connectedSolWallet,
      wallet,
      chainId,
    } = get();

    const clearBalance = {
      bridgeDepositBalance: null,
      bridgeDepositBalanceUnit: null,
      bridgeDepositBalanceLoading: false,
    } as const;

    if (!sdk || !bridgeSelectedToken) {
      set(clearBalance);
      return;
    }

    const isCurrentRequest = createBridgeRequestGuard(
      {
        sdk,
        chainId,
        bridgeDirection,
        wallet,
        connectedEthWallet,
        connectedSolWallet,
        bridgeSelectedToken,
      },
      get
    );

    set(clearBalance);

    const externalWallet =
      bridgeSelectedToken.chain === ExternalChain.ETHEREUM
        ? connectedEthWallet
        : connectedSolWallet;

    if (!externalWallet) {
      set(clearBalance);
      return;
    }

    set({ bridgeDepositBalanceLoading: true });

    try {
      let balance: Amount | null;
      if (!wallet) {
        balance = null;
      } else {
        if (bridgeDirection === "from-starknet") {
          const erc20 = new Erc20(
            {
              name: bridgeSelectedToken.name,
              address: bridgeSelectedToken.starknetAddress,
              decimals: bridgeSelectedToken.decimals,
              symbol: bridgeSelectedToken.symbol,
            },
            sdk.getProvider()
          );

          balance = await erc20.balanceOf(wallet);
        } else {
          if (
            bridgeSelectedToken.chain === ExternalChain.ETHEREUM &&
            connectedEthWallet
          ) {
            balance = await wallet.getDepositBalance(
              bridgeSelectedToken as EthereumBridgeToken,
              connectedEthWallet
            );
          } else if (
            bridgeSelectedToken.chain === ExternalChain.SOLANA &&
            connectedSolWallet
          ) {
            balance = await wallet.getDepositBalance(
              bridgeSelectedToken as SolanaBridgeToken,
              connectedSolWallet
            );
          } else {
            balance = null;
          }
        }
      }

      if (!isCurrentRequest()) {
        return;
      }
      set({
        bridgeDepositBalance: balance ? balance.toFormatted(true) : null,
        bridgeDepositBalanceUnit: balance ? balance.toUnit() : null,
        bridgeDepositBalanceLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch deposit balance:", error);
      if (!isCurrentRequest()) {
        return;
      }
      set({
        ...clearBalance,
        bridgeError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  fetchBridgeAllowance: async () => {
    const {
      sdk,
      wallet,
      bridgeSelectedToken,
      bridgeDirection,
      connectedEthWallet,
      connectedSolWallet,
      addLog,
      chainId,
    } = get();

    if (!sdk || !bridgeSelectedToken || bridgeDirection !== "to-starknet") {
      set({ bridgeAllowance: null, bridgeAllowanceLoading: false });
      return;
    }

    const isCurrentRequest = createBridgeRequestGuard(
      {
        sdk,
        chainId,
        bridgeDirection,
        wallet,
        connectedEthWallet,
        connectedSolWallet,
        bridgeSelectedToken,
      },
      get
    );

    const externalWallet =
      bridgeSelectedToken.chain === ExternalChain.ETHEREUM
        ? connectedEthWallet
        : connectedSolWallet;

    if (!externalWallet || !wallet) {
      set({ bridgeAllowance: null, bridgeAllowanceLoading: false });
      return;
    }

    set({ bridgeAllowanceLoading: true });

    try {
      let allowance;

      if (
        bridgeSelectedToken.chain === ExternalChain.ETHEREUM &&
        connectedEthWallet
      ) {
        allowance = await wallet.getAllowance(
          bridgeSelectedToken as EthereumBridgeToken,
          connectedEthWallet
        );
      } else if (
        bridgeSelectedToken.chain === ExternalChain.SOLANA &&
        connectedSolWallet
      ) {
        allowance = await wallet.getAllowance(
          bridgeSelectedToken as SolanaBridgeToken,
          connectedSolWallet
        );
      }

      if (!isCurrentRequest()) {
        return;
      }
      set({
        bridgeAllowance: allowance ? allowance.toFormatted(true) : null,
        bridgeAllowanceLoading: false,
      });
    } catch (error) {
      addLog(`Failed to calculate allowance ${error?.toString()}`);
      if (!isCurrentRequest()) {
        return;
      }
      set({ bridgeAllowance: null, bridgeAllowanceLoading: false });
    }
  },

  fetchBridgeDepositFeeEstimate: async () => {
    const {
      wallet,
      bridgeSelectedToken,
      bridgeDirection,
      connectedEthWallet,
      connectedSolWallet,
      bridgeFastTransfer,
      addLog,
      chainId,
    } = get();

    if (!wallet || !bridgeSelectedToken || bridgeDirection !== "to-starknet") {
      set({ bridgeDepositFeeEstimate: null, bridgeDepositFeeLoading: false });
      return;
    }

    const isCurrentRequest = createBridgeRequestGuard(
      {
        chainId,
        bridgeDirection,
        wallet,
        connectedEthWallet,
        connectedSolWallet,
        bridgeSelectedToken,
        bridgeFastTransfer,
      },
      get
    );

    const isEthereum = bridgeSelectedToken.chain === ExternalChain.ETHEREUM;
    const isSolana = bridgeSelectedToken.chain === ExternalChain.SOLANA;

    if (
      (isEthereum && !connectedEthWallet) ||
      (isSolana && !connectedSolWallet)
    ) {
      set({ bridgeDepositFeeEstimate: null, bridgeDepositFeeLoading: false });
      return;
    }

    set({ bridgeDepositFeeLoading: true });

    try {
      let estimate: BridgeDepositFeeEstimation;

      if (isEthereum && connectedEthWallet) {
        estimate = await wallet.getDepositFeeEstimate(
          bridgeSelectedToken as EthereumBridgeToken,
          connectedEthWallet,
          { fastTransfer: bridgeFastTransfer }
        );
      } else if (isSolana && connectedSolWallet) {
        estimate = await wallet.getDepositFeeEstimate(
          bridgeSelectedToken as SolanaBridgeToken,
          connectedSolWallet
        );
      } else {
        set({ bridgeDepositFeeEstimate: null, bridgeDepositFeeLoading: false });
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      set({
        bridgeDepositFeeEstimate: estimate,
        bridgeDepositFeeLoading: false,
      });
    } catch (error) {
      addLog(`Failed to estimate fees ${error?.toString()}`);
      if (!isCurrentRequest()) {
        return;
      }
      set({ bridgeDepositFeeEstimate: null, bridgeDepositFeeLoading: false });
    }
  },

  setBridgeFastTransfer: (value: boolean) => {
    set({ bridgeFastTransfer: value });
  },

  initiateBridge: async (amount: string) => {
    const {
      sdk,
      bridgeSelectedToken,
      bridgeDirection,
      bridgeFastTransfer,
      wallet,
      connectedEthWallet,
      connectedSolWallet,
      addLog,
    } = get();

    if (!sdk || !bridgeSelectedToken) {
      Alert.alert("Error", "Please select a token first.");
      return;
    }

    if (bridgeDirection === "to-starknet") {
      const externalWallet =
        bridgeSelectedToken.chain === ExternalChain.ETHEREUM
          ? connectedEthWallet
          : connectedSolWallet;

      if (!externalWallet) {
        Alert.alert("Error", "Please connect your external wallet first.");
        return;
      }

      if (!wallet) {
        Alert.alert(
          "Error",
          "Please connect your Starknet wallet to receive funds."
        );
        return;
      }

      addLog(
        `Bridge deposit: ${amount} ${bridgeSelectedToken.symbol} → Starknet`
      );

      try {
        const depositAmount = Amount.parse(
          amount,
          bridgeSelectedToken.decimals,
          bridgeSelectedToken.symbol
        );

        if (
          bridgeSelectedToken.chain === ExternalChain.ETHEREUM &&
          connectedEthWallet
        ) {
          const txResponse = await wallet.deposit(
            wallet.address,
            depositAmount,
            bridgeSelectedToken as EthereumBridgeToken,
            connectedEthWallet,
            { fastTransfer: bridgeFastTransfer }
          );
          addLog(`Deposit tx sent: ${txResponse.hash}`);
        } else if (
          bridgeSelectedToken.chain === ExternalChain.SOLANA &&
          connectedSolWallet
        ) {
          const txResponse = await wallet.deposit(
            wallet.address,
            depositAmount,
            bridgeSelectedToken as SolanaBridgeToken,
            connectedSolWallet
          );
          addLog(`Deposit tx sent: ${txResponse.hash}`);
        }
      } catch (err) {
        const errStr = String(err);
        addLog(`Deposit failed: ${errStr}`);
        Alert.alert("Deposit Failed", errStr);
      }
    } else {
      if (!wallet) {
        Alert.alert("Error", "Please connect your Starknet wallet first.");
        return;
      }

      // TODO: Implement withdrawal from Starknet
      addLog(
        `Bridge withdrawal: ${amount} ${bridgeSelectedToken.symbol} → ${bridgeSelectedToken.chain}`
      );
    }
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
        privateKey: "",
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
    const { addLog, networkSwitchRequestId } = get();
    set({
      isConnecting: false,
      isCheckingStatus: false,
      wallet: null,
      walletType: null,
      isDeployed: null,
      privateKey: "",
      privyEmail: "",
      privyWalletId: null,
      privyPublicKey: null,
      networkSwitchRequestId: networkSwitchRequestId + 1,
    });
    addLog("Disconnected");
  },

  checkDeploymentStatus: async () => {
    const { wallet, addLog, networkSwitchRequestId } = get();
    if (!wallet) return;

    const requestId = networkSwitchRequestId;
    set({ isCheckingStatus: true });
    try {
      const deployed = await wallet.isDeployed();
      if (
        get().networkSwitchRequestId !== requestId ||
        get().wallet !== wallet
      ) {
        return;
      }
      set({ isDeployed: deployed });
      addLog(`Account is ${deployed ? "deployed ✓" : "not deployed"}`);
    } catch (err) {
      if (
        get().networkSwitchRequestId !== requestId ||
        get().wallet !== wallet
      ) {
        return;
      }
      addLog(`Failed to check status: ${err}`);
    } finally {
      if (
        get().networkSwitchRequestId !== requestId ||
        get().wallet !== wallet
      ) {
        return;
      }
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
