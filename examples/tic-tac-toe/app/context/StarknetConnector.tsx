import type { WalletInterface } from "@starkzap/native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type StarknetNetwork = "SN_MAIN" | "SN_SEPOLIA" | "SN_DEVNET";
type StarknetProvider = ReturnType<WalletInterface["getProvider"]>;
type StarknetAccount = ReturnType<WalletInterface["getAccount"]>;

type CartridgeTsOpenSessionArgs = {
  url: string;
  redirectUrl?: string;
  redirectQueryName: string;
};

type CartridgeTsOpenSessionResult = {
  encodedSession?: string;
  callbackUrl?: string;
  status?: "success" | "cancel" | "dismiss";
};

type StarkZapNativeModule = typeof import("@starkzap/native") & {
  registerCartridgeTsAdapter: (options?: {
    logger?: Pick<Console, "info" | "warn" | "error">;
    sessionRegistrationTimeoutMs?: number;
    sessionRequestTimeoutMs?: number;
    openSession?: (
      args: CartridgeTsOpenSessionArgs
    ) => Promise<CartridgeTsOpenSessionResult>;
  }) => unknown;
};

WebBrowser.maybeCompleteAuthSession();

const DEFAULT_NETWORK: StarknetNetwork = "SN_SEPOLIA";
const DEFAULT_TIC_TAC_TOE_CONTRACT_ADDRESS =
  "0x03727da24037502a3e38ac980239982e3974c8ca78bd87ab5963a7a8690fd8e8";

const CARTRIDGE_RPC_BY_NETWORK: Record<StarknetNetwork, string> = {
  SN_MAIN: "https://api.cartridge.gg/x/starknet/mainnet",
  SN_SEPOLIA: "https://api.cartridge.gg/x/starknet/sepolia",
  SN_DEVNET: "https://api.cartridge.gg/x/starknet/sepolia",
};

function normalizeNetwork(value: string | undefined): StarknetNetwork {
  if (value === "SN_MAIN" || value === "SN_SEPOLIA" || value === "SN_DEVNET") {
    return value;
  }
  return DEFAULT_NETWORK;
}

function toSdkNetwork(
  network: StarknetNetwork
): "mainnet" | "sepolia" | "devnet" {
  switch (network) {
    case "SN_MAIN":
      return "mainnet";
    case "SN_DEVNET":
      return "devnet";
    case "SN_SEPOLIA":
    default:
      return "sepolia";
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveCartridgeRpc(network: StarknetNetwork): string {
  const configured = process.env.EXPO_PUBLIC_CARTRIDGE_RPC?.trim();
  if (configured) {
    return configured;
  }
  return CARTRIDGE_RPC_BY_NETWORK[network];
}

function resolveCartridgeRedirectUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL?.trim();
  if (configured) {
    return configured;
  }

  try {
    const generated = Linking.createURL("cartridge/callback");
    return generated.trim().length > 0 ? generated : undefined;
  } catch {
    return undefined;
  }
}

function registerTsCartridgeAdapter(
  native: StarkZapNativeModule,
  defaultRedirectUrl?: string
): void {
  if (typeof native.registerCartridgeTsAdapter !== "function") {
    throw new Error(
      "Installed @starkzap/native build does not expose registerCartridgeTsAdapter(). Rebuild @starkzap/native before running the app."
    );
  }

  native.registerCartridgeTsAdapter({
    logger: console,
    sessionRegistrationTimeoutMs: 180_000,
    sessionRequestTimeoutMs: 10_000,
    openSession: async ({
      url,
      redirectUrl,
      redirectQueryName: _redirectQueryName,
    }: CartridgeTsOpenSessionArgs): Promise<CartridgeTsOpenSessionResult> => {
      const callbackUrl = redirectUrl ?? defaultRedirectUrl;
      if (callbackUrl) {
        const authResult = await WebBrowser.openAuthSessionAsync(
          url,
          callbackUrl
        );

        if (authResult.type === "success") {
          return {
            status: "success",
            ...("url" in authResult && authResult.url
              ? { callbackUrl: authResult.url }
              : {}),
          };
        }
        if (authResult.type === "cancel") {
          return { status: "cancel" };
        }
        return { status: "dismiss" };
      }

      // Fallback for runtimes where redirect callbacks are unavailable.
      await WebBrowser.openBrowserAsync(url);
      return {};
    },
  });
}

let nativeModulePromise: Promise<StarkZapNativeModule> | null = null;
function loadNativeModule(): Promise<StarkZapNativeModule> {
  if (!nativeModulePromise) {
    nativeModulePromise =
      import("@starkzap/native") as unknown as Promise<StarkZapNativeModule>;
  }
  return nativeModulePromise;
}

let didRegisterCartridgeAdapter = false;
let adapterRegistrationPromise: Promise<void> | null = null;

async function ensureCartridgeAdapterRegistered(
  defaultRedirectUrl?: string
): Promise<void> {
  if (didRegisterCartridgeAdapter) {
    return;
  }
  if (adapterRegistrationPromise) {
    return adapterRegistrationPromise;
  }

  adapterRegistrationPromise = (async () => {
    const native = await loadNativeModule();
    registerTsCartridgeAdapter(native, defaultRedirectUrl);
    didRegisterCartridgeAdapter = true;
  })();

  try {
    await adapterRegistrationPromise;
  } finally {
    adapterRegistrationPromise = null;
  }
}

function getTicTacToePolicies() {
  const contractAddress =
    process.env.EXPO_PUBLIC_TIC_TAC_TOE_CONTRACT_ADDRESS ||
    DEFAULT_TIC_TAC_TOE_CONTRACT_ADDRESS;

  return [
    { target: contractAddress, method: "create_game" },
    { target: contractAddress, method: "play_move" },
  ];
}

type StarknetConnectorContextType = {
  network: StarknetNetwork;
  provider: StarknetProvider | null;
  wallet: WalletInterface | null;
  account: StarknetAccount | null;
  connecting: boolean;
  error: string | null;
  connectCartridge: () => Promise<void>;
  disconnectAccount: () => Promise<void>;
  waitForTransaction: (txHash: string) => Promise<boolean>;
};

const StarknetConnector = createContext<
  StarknetConnectorContextType | undefined
>(undefined);

export const useStarknetConnector = () => {
  const context = useContext(StarknetConnector);
  if (!context) {
    throw new Error(
      "useStarknetConnector must be used within a StarknetConnectorProvider"
    );
  }
  return context;
};

export const StarknetConnectorProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const network = normalizeNetwork(process.env.EXPO_PUBLIC_STARKNET_NETWORK);
  const cartridgeRpc = resolveCartridgeRpc(network);
  const cartridgeRedirectUrl = resolveCartridgeRedirectUrl();
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [account, setAccount] = useState<StarknetAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectCartridge = useCallback(async () => {
    setError(null);

    setConnecting(true);
    try {
      const native = await loadNativeModule();
      const sdk = new native.StarkZap({
        network: toSdkNetwork(network),
        rpcUrl: cartridgeRpc,
      });
      await ensureCartridgeAdapterRegistered(cartridgeRedirectUrl);
      const policies = getTicTacToePolicies();
      const onboard = await sdk.onboard({
        strategy: "cartridge",
        deploy: "never",
        cartridge: {
          ...(policies ? { policies } : {}),
          ...(process.env.EXPO_PUBLIC_CARTRIDGE_PRESET
            ? { preset: process.env.EXPO_PUBLIC_CARTRIDGE_PRESET }
            : {}),
          ...(process.env.EXPO_PUBLIC_CARTRIDGE_URL
            ? { url: process.env.EXPO_PUBLIC_CARTRIDGE_URL }
            : { url: "https://x.cartridge.gg" }),
          ...(cartridgeRedirectUrl
            ? { redirectUrl: cartridgeRedirectUrl }
            : {}),
        },
      });

      const connectedWallet = onboard.wallet as WalletInterface;
      setWallet(connectedWallet);
      setAccount(connectedWallet.getAccount());
    } catch (connectError) {
      const message = toErrorMessage(connectError);
      setError(message);
      throw connectError;
    } finally {
      setConnecting(false);
    }
  }, [cartridgeRedirectUrl, cartridgeRpc, network]);

  const disconnectAccount = useCallback(async () => {
    setError(null);
    if (!wallet) {
      setAccount(null);
      return;
    }

    try {
      await wallet.disconnect();
    } finally {
      setWallet(null);
      setAccount(null);
    }
  }, [wallet]);

  const provider = useMemo(() => wallet?.getProvider() ?? null, [wallet]);

  const waitForTransaction = useCallback(
    async (txHash: string): Promise<boolean> => {
      if (!provider) {
        return false;
      }
      try {
        await provider.waitForTransaction(txHash);
        return true;
      } catch {
        return false;
      }
    },
    [provider]
  );

  const value = useMemo(
    () => ({
      network,
      provider,
      wallet,
      account,
      connecting,
      error,
      connectCartridge,
      disconnectAccount,
      waitForTransaction,
    }),
    [
      account,
      connectCartridge,
      connecting,
      disconnectAccount,
      error,
      network,
      provider,
      waitForTransaction,
      wallet,
    ]
  );

  return (
    <StarknetConnector.Provider value={value}>
      {children}
    </StarknetConnector.Provider>
  );
};
