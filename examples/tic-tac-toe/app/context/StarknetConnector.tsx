import type { WalletInterface } from "@starkzap/native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { TransactionExecutionStatus } from "starknet";
import type { GetTransactionReceiptResponse } from "starknet";

type StarknetNetwork = "SN_MAIN" | "SN_SEPOLIA";
type StarknetProvider = ReturnType<WalletInterface["getProvider"]>;
type StarknetAccount = ReturnType<WalletInterface["getAccount"]>;
type WaitForTransactionResult = {
  success: boolean;
  reverted: boolean;
  receipt?: GetTransactionReceiptResponse;
};

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

// Complete any pending auth session from a previous redirect.
// Must be called at module level for Expo WebBrowser auth flow.
WebBrowser.maybeCompleteAuthSession();

const DEFAULT_NETWORK: StarknetNetwork = "SN_SEPOLIA";
const DEFAULT_TIC_TAC_TOE_CONTRACT_ADDRESS =
  "0x03727da24037502a3e38ac980239982e3974c8ca78bd87ab5963a7a8690fd8e8";

const CARTRIDGE_RPC_BY_NETWORK: Record<StarknetNetwork, string> = {
  SN_MAIN: "https://api.cartridge.gg/x/starknet/mainnet",
  SN_SEPOLIA: "https://api.cartridge.gg/x/starknet/sepolia",
};

function normalizeNetwork(value: string | undefined): StarknetNetwork {
  if (value === undefined || value === "") {
    return DEFAULT_NETWORK;
  }

  if (value === "SN_MAIN" || value === "SN_SEPOLIA") {
    return value;
  }

  const allowedNetworks: readonly StarknetNetwork[] = ["SN_MAIN", "SN_SEPOLIA"];

  throw new Error(
    `normalizeNetwork received invalid EXPO_PUBLIC_STARKNET_NETWORK "${value}". Allowed StarknetNetwork values: ${allowedNetworks.join(
      ", "
    )}. Leave it unset to use DEFAULT_NETWORK (${DEFAULT_NETWORK}).`
  );
}

function toSdkNetwork(network: StarknetNetwork): "mainnet" | "sepolia" {
  switch (network) {
    case "SN_MAIN":
      return "mainnet";
    case "SN_SEPOLIA":
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

function isRevertedWaitError(error: unknown): error is Error & {
  response?: { execution_status?: string };
} {
  if (!(error instanceof Error)) {
    return false;
  }

  const response = (error as { response?: { execution_status?: string } })
    .response;

  return (
    response?.execution_status === TransactionExecutionStatus.REVERTED ||
    error.message.includes(TransactionExecutionStatus.REVERTED)
  );
}

async function getReceiptIfAvailable(
  provider: StarknetProvider,
  txHash: string
): Promise<GetTransactionReceiptResponse | undefined> {
  try {
    return await provider.getTransactionReceipt(txHash);
  } catch (error) {
    console.warn(
      `[StarknetConnector] Failed to retrieve receipt for ${txHash}:`,
      toErrorMessage(error)
    );
    return undefined;
  }
}

function resolveCartridgeRedirectUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL?.trim();
  if (configured) {
    return configured;
  }

  try {
    const generated = Linking.createURL("cartridge/callback");
    return generated.trim().length > 0 ? generated : undefined;
  } catch (error) {
    console.warn(
      "[StarknetConnector] Linking.createURL failed; redirect-based auth unavailable:",
      toErrorMessage(error)
    );
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
    }: CartridgeTsOpenSessionArgs): Promise<CartridgeTsOpenSessionResult> => {
      const callbackUrl = redirectUrl ?? defaultRedirectUrl;
      if (callbackUrl) {
        const authResult = await WebBrowser.openAuthSessionAsync(
          url,
          callbackUrl
        );

        if (authResult.type === "success") {
          const callbackUrl =
            "url" in authResult && authResult.url ? authResult.url : undefined;
          return { status: "success", callbackUrl };
        }

        return { status: authResult.type === "cancel" ? "cancel" : "dismiss" };
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
    // Clear so a failed registration can be retried; success is still gated by
    // didRegisterCartridgeAdapter for subsequent calls.
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
  waitForTransaction: (txHash: string) => Promise<WaitForTransactionResult>;
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
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [account, setAccount] = useState<StarknetAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectCartridge = useCallback(async () => {
    if (connectInFlightRef.current) {
      return connectInFlightRef.current;
    }

    setError(null);

    connectInFlightRef.current = (async () => {
      setConnecting(true);
      try {
        const native = await loadNativeModule();
        await ensureCartridgeAdapterRegistered(cartridgeRedirectUrl);
        const sdk = new native.StarkZap({
          network: toSdkNetwork(network),
          rpcUrl: cartridgeRpc,
        });
        const onboard = await sdk.onboard({
          strategy: "cartridge",
          deploy: "never",
          cartridge: {
            policies: getTicTacToePolicies(),
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
        connectInFlightRef.current = null;
      }
    })();

    return connectInFlightRef.current;
  }, [cartridgeRedirectUrl, cartridgeRpc, network]);

  const disconnectAccount = useCallback(async () => {
    setError(null);
    if (!wallet) {
      setAccount(null);
      return;
    }

    try {
      await wallet.disconnect();
    } catch (error) {
      console.warn(
        "[StarknetConnector] disconnect failed:",
        toErrorMessage(error)
      );
    } finally {
      setWallet(null);
      setAccount(null);
    }
  }, [wallet]);

  const provider = useMemo(() => wallet?.getProvider() ?? null, [wallet]);

  const waitForTransaction = useCallback(
    async (txHash: string): Promise<WaitForTransactionResult> => {
      if (!provider) {
        throw new Error(
          "waitForTransaction called without a connected wallet."
        );
      }

      try {
        const receipt = await provider.waitForTransaction(txHash);

        if (receipt.isReverted()) {
          return { success: false, reverted: true, receipt };
        }

        return { success: true, reverted: false, receipt };
      } catch (waitError) {
        if (!isRevertedWaitError(waitError)) {
          throw waitError;
        }

        const receipt = await getReceiptIfAvailable(provider, txHash);
        return { success: false, reverted: true, receipt };
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
