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
  preferSponsored: false,
  setPreferSponsored: (value) => set({ preferSponsored: value }),
  setPrivySelectedPreset: (preset) => set({ privySelectedPreset: preset }),

  wallet: null,
  isDeployed: null,
  isConnecting: false,
  isCheckingStatus: false,
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
  selectNetwork: (index) => {
    const network = NETWORKS[index];
    if (network) {
      set({
        selectedNetworkIndex: index,
        rpcUrl: network.rpcUrl,
        chainId: network.chainId,
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
      });
    }
  },

  selectCustomNetwork: () => {
    set({ selectedNetworkIndex: null });
  },

  setCustomRpcUrl: (url) => set({ customRpcUrl: url }),

  setCustomChainId: (chainId) => set({ customChainId: ChainId.from(chainId) }),

  confirmNetworkConfig: () => {
    const { selectedNetworkIndex, customRpcUrl, customChainId, addLog } = get();

    let rpcUrl: string;
    let chainId: ChainId;
    let stakingConfig: StakingConfig;

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

    if (chainId.isMainnet()) {
      stakingConfig = {
        contract: fromAddress(
          "0x00ca1702e64c81d9a07b86bd2c540188d92a2c73cf5cc0e508d949015e7e84a7"
        ),
      };
    } else if (chainId.isSepolia()) {
      stakingConfig = {
        contract: fromAddress(
          "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
        ),
      };
    }

    const paymasterNodeUrl = resolveExamplePaymasterNodeUrl({
      explicitProxyUrl: EXPLICIT_PAYMASTER_PROXY_URL,
      privyServerUrl: PRIVY_SERVER_URL,
      chainId: chainId.toLiteral(),
    });

    const newSdk = new StarkZap({
      rpcUrl,
      chainId,
      ...(paymasterNodeUrl && {
        paymaster: { nodeUrl: paymasterNodeUrl },
      }),
      staking: stakingConfig!,
    });
    set({
      sdk: newSdk,
      paymasterNodeUrl,
      rpcUrl,
      chainId,
      isConfigured: true,
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
      logs: [
        `SDK configured with ${selectedNetworkIndex !== null ? NETWORKS[selectedNetworkIndex].name : "Custom Network"}`,
      ],
    });
    addLog(`RPC: ${rpcUrl}`);
    addLog(`Chain: ${chainId.toLiteral()}`);
    if (paymasterNodeUrl) {
      addLog(`Paymaster: ${paymasterNodeUrl}`);
    } else if (chainId.isMainnet()) {
      addLog(MAINNET_PAYMASTER_DISABLED_MESSAGE);
    } else {
      addLog("Paymaster: disabled");
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
      selectedNetworkIndex: DEFAULT_NETWORK_INDEX,
      rpcUrl: defaultNetwork.rpcUrl,
      chainId: defaultNetwork.chainId,
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
    const { sdk, bridgeExternalChain } = get();

    if (!sdk) {
      return;
    }

    set({ bridgeIsLoading: true, bridgeError: null });

    try {
      const bridgeTokens = await sdk.getBridgingTokens(bridgeExternalChain);

      set({
        bridgeTokens,
        bridgeIsLoading: false,
        bridgeError: null,
        bridgeLastUpdated: new Date(),
      });
    } catch (error) {
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

      set({
        bridgeDepositBalance: balance ? balance.toFormatted(true) : null,
        bridgeDepositBalanceUnit: balance ? balance.toUnit() : null,
        bridgeDepositBalanceLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch deposit balance:", error);
      set(clearBalance);
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
    } = get();

    if (!sdk || !bridgeSelectedToken || bridgeDirection !== "to-starknet") {
      set({ bridgeAllowance: null, bridgeAllowanceLoading: false });
      return;
    }

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

      set({
        bridgeAllowance: allowance ? allowance.toFormatted(true) : null,
        bridgeAllowanceLoading: false,
      });
    } catch (error) {
      addLog(`Failed to calculate allowance ${error?.toString()}`);
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
    } = get();

    if (!wallet || !bridgeSelectedToken || bridgeDirection !== "to-starknet") {
      set({ bridgeDepositFeeEstimate: null, bridgeDepositFeeLoading: false });
      return;
    }

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

      set({
        bridgeDepositFeeEstimate: estimate,
        bridgeDepositFeeLoading: false,
      });
    } catch (error) {
      addLog(`Failed to estimate fees ${error?.toString()}`);
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
      const dcaProviders = getDcaProviders();
      const signer = new StarkSigner(privateKey.trim());
      const onboard = await sdk.onboard({
        strategy: OnboardStrategy.Signer,
        deploy: "never",
        ...(preferSponsored && { feeMode: "sponsored" as const }),
        account: { signer },
        accountPreset: PRESETS[selectedPreset],
        swapProviders,
        defaultSwapProviderId: swapProviders[0]?.id,
        dcaProviders,
        defaultDcaProviderId: dcaProviders[0]?.id,
      });
      const connectedWallet = onboard.wallet;

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
      const dcaProviders = getDcaProviders();
      const onboard = await sdk.onboard({
        strategy: OnboardStrategy.Privy,
        deploy: "never",
        ...(preferSponsored && { feeMode: "sponsored" as const }),
        accountPreset: PRESETS[privySelectedPreset],
        swapProviders,
        defaultSwapProviderId: swapProviders[0]?.id,
        dcaProviders,
        defaultDcaProviderId: dcaProviders[0]?.id,
        privy: {
          resolve: async () => ({
            walletId,
            publicKey,
            serverUrl: `${PRIVY_SERVER_URL}/api/wallet/sign`,
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        },
      });
      const connectedWallet = onboard.wallet;

      set({ wallet: connectedWallet, walletType: "privy" });
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
