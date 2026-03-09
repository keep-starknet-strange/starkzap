import type {
  CartridgeNativeAdapter,
  CartridgeNativeSessionHandle,
  WalletInterface,
} from "@starkzap/native";
import * as WebBrowser from "expo-web-browser";
import {
  SessionAccount,
  type SessionPolicies,
  type SessionPolicy,
  type Call,
} from "@/modules/controller/src";
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
type StarkZapNativeModule = typeof import("@starkzap/native");
type StarknetModule = typeof import("starknet");

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

const CARTRIDGE_API_URL = "https://api.cartridge.gg";
const DEFAULT_CARTRIDGE_URL = "https://x.cartridge.gg";
const DEFAULT_MAX_FEE = "0x5AF3107A4000"; // 100_000_000_000_000 wei

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

function buildSessionPolicies(
  starknet: StarknetModule,
  policies: Array<{ target: string; method: string }>,
  maxFee: string = DEFAULT_MAX_FEE
): SessionPolicies {
  const sessionPolicies: SessionPolicy[] = policies.map((p) => ({
    contractAddress:
      typeof starknet.addAddressPadding === "function"
        ? starknet.addAddressPadding(String(p.target))
        : String(p.target),
    entrypoint: String(p.method),
  }));
  return { policies: sessionPolicies, maxFee };
}

function normalizeCallsForUniffi(
  starknet: StarknetModule,
  calls: unknown[]
): Call[] {
  type CallInput = {
    contractAddress?: unknown;
    entrypoint?: unknown;
    calldata?: unknown;
  };

  return calls.map((call) => {
    const normalized = (call ?? {}) as CallInput;
    const rawCalldata = normalized.calldata ?? [];
    const calldataElements: string[] = Array.isArray(rawCalldata)
      ? starknet.CallData.compile(rawCalldata)
      : [];
    return {
      contractAddress:
        typeof starknet.addAddressPadding === "function"
          ? starknet.addAddressPadding(String(normalized.contractAddress))
          : String(normalized.contractAddress),
      entrypoint: String(normalized.entrypoint),
      calldata: calldataElements,
    };
  });
}

function normalizeTransactionHash(response: unknown): string {
  if (typeof response === "string" && response) {
    return response;
  }
  const result = response as {
    transaction_hash?: string;
    transactionHash?: string;
    data?: { transaction_hash?: string; transactionHash?: string };
  };
  return (
    result?.transaction_hash ||
    result?.transactionHash ||
    result?.data?.transaction_hash ||
    result?.data?.transactionHash ||
    ""
  );
}

function buildCartridgeSessionUrl(
  baseUrl: string,
  publicKey: string,
  policies: Array<{ target: string; method: string }>,
  rpcUrl: string
): string {
  const root = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    public_key: publicKey,
    policies: JSON.stringify(
      policies.map((p) => ({ target: p.target, method: p.method }))
    ),
    rpc_url: rpcUrl,
  });
  return `${root}/session?${params.toString()}`;
}

function createSessionAccountAsync(
  privateKey: string,
  sessionPolicies: SessionPolicies,
  rpcUrl: string
): Promise<ReturnType<typeof SessionAccount.createFromSubscribe>> {
  return new Promise((resolve, reject) => {
    // createFromSubscribe is synchronous and can block JS while waiting on auth.
    // Queue it so Safari can be opened first.
    setTimeout(() => {
      try {
        resolve(
          SessionAccount.createFromSubscribe(
            privateKey,
            sessionPolicies,
            rpcUrl,
            CARTRIDGE_API_URL
          )
        );
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

async function createDefaultNativeCartridgeAdapter(): Promise<CartridgeNativeAdapter> {
  return {
    async connect(args) {
      const starknet = await import("starknet");
      const sessionPrivateKey = starknet.stark.randomAddress();
      const sessionPublicKey =
        starknet.ec.starkCurve.getStarkKey(sessionPrivateKey);
      const formattedPrivateKey =
        starknet.encode.addHexPrefix(sessionPrivateKey);

      const policies = (args.policies ?? []) as Array<{
        target: string;
        method: string;
      }>;
      const sessionPolicies = buildSessionPolicies(starknet, policies);
      const cartridgeUrl =
        args.url ||
        process.env.EXPO_PUBLIC_CARTRIDGE_URL ||
        DEFAULT_CARTRIDGE_URL;
      const sessionUrl = buildCartridgeSessionUrl(
        cartridgeUrl,
        sessionPublicKey,
        policies,
        args.rpcUrl
      );

      const browserTask = WebBrowser.openBrowserAsync(sessionUrl);
      let sessionAccount: ReturnType<typeof SessionAccount.createFromSubscribe>;
      try {
        sessionAccount = await createSessionAccountAsync(
          formattedPrivateKey,
          sessionPolicies,
          args.rpcUrl
        );
      } catch (error) {
        try {
          await WebBrowser.dismissBrowser();
        } catch {
          // Browser may already be closed by the user.
        }
        throw error;
      }

      try {
        await WebBrowser.dismissBrowser();
      } catch {
        // Browser may already be closed by the user.
      }
      void browserTask.catch(() => undefined);

      const address = sessionAccount.address();

      const executeSession = async (calls: unknown[]) => {
        const normalizedCalls = normalizeCallsForUniffi(starknet, calls);
        try {
          return sessionAccount.executeFromOutside(normalizedCalls);
        } catch {
          return sessionAccount.execute(normalizedCalls);
        }
      };

      const sessionHandle: CartridgeNativeSessionHandle = {
        account: {
          address,
          executePaymasterTransaction: async (calls: unknown[]) => {
            const transaction_hash = normalizeTransactionHash(
              await executeSession(calls)
            );
            if (!transaction_hash) {
              throw new Error("Cartridge did not return a transaction hash.");
            }

            return { transaction_hash };
          },
        },
        username: async () => sessionAccount.username(),
        disconnect: async () => {},
        controller: { type: "cartridge-native-session" },
      };
      return sessionHandle;
    },
  };
}

let nativeModulePromise: Promise<StarkZapNativeModule> | null = null;
function loadNativeModule(): Promise<StarkZapNativeModule> {
  if (!nativeModulePromise) {
    nativeModulePromise = import("@starkzap/native");
  }
  return nativeModulePromise;
}

let didRegisterNativeAdapter = false;
let adapterRegistrationPromise: Promise<void> | null = null;

async function ensureNativeAdapterRegistered(): Promise<void> {
  if (didRegisterNativeAdapter) {
    return;
  }
  if (adapterRegistrationPromise) {
    return adapterRegistrationPromise;
  }

  adapterRegistrationPromise = (async () => {
    const native = await loadNativeModule();
    const adapter = await createDefaultNativeCartridgeAdapter();
    native.registerCartridgeNativeAdapter(adapter);
    didRegisterNativeAdapter = true;
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
      await ensureNativeAdapterRegistered();
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
          ...(process.env.EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL
            ? { redirectUrl: process.env.EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL }
            : { redirectUrl: "tictactoe://cartridge/callback" }),
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
  }, [cartridgeRpc, network]);

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

  const provider = wallet?.getProvider() ?? null;

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
