import { writable, get } from "svelte/store";
import {
  StarkZap,
  StarkSigner,
  OnboardStrategy,
  type WalletInterface,
} from "starkzap";
import {
  RPC_URL,
  CHAIN_ID,
  buildBridgingConfig,
  ACCOUNT_PRESETS,
  PRIVY_SERVER_URL,
  AUTO_PRIVATE_KEY,
  AUTO_ACCOUNT_PRESET,
} from "./config";
import { sdkLogger, log } from "./logger";
import { getSwapProviders } from "../../../swaps";
import { getDcaProviders } from "../../../dca";
import * as privacy from "~/features/privacy/store";

export type WalletType = "cartridge" | "privatekey" | "privy";

// STRK — same address on mainnet and sepolia. Minimal Cartridge session scope.
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const CARTRIDGE_POLICY = { target: STRK_ADDRESS, method: "transfer" };

const swapProviders = getSwapProviders();
const dcaProviders = getDcaProviders();

// Swap/DCA provider options for the selectors. Ekubo is fetch-only (no key);
// Avnu uses @avnu/avnu-sdk. Both registered; Ekubo is the default.
export const PROVIDER_OPTIONS_LIST = [
  { label: "Ekubo", value: "ekubo" },
  { label: "Avnu", value: "avnu" },
];

const PROVIDER_OPTIONS = {
  swapProviders,
  defaultSwapProviderId: swapProviders[0]?.id,
  dcaProviders,
  defaultDcaProviderId: dcaProviders[0]?.id,
};

const bridging = buildBridgingConfig();

// One SDK for the resolved network (network switch reloads the page — see config).
export const sdk = new StarkZap({
  rpcUrl: RPC_URL,
  chainId: CHAIN_ID,
  logging: { logger: sdkLogger },
  ...(bridging ? { bridging } : {}),
});

interface WalletState {
  wallet: WalletInterface | null;
  walletType: WalletType | null;
  address: string | null;
  isDeployed: boolean | null;
  connecting: boolean;
  error: string | null;
}

export const walletState = writable<WalletState>({
  wallet: null,
  walletType: null,
  address: null,
  isDeployed: null,
  connecting: false,
  error: null,
});

async function connect(
  type: WalletType,
  onboard: () => Promise<WalletInterface>
): Promise<void> {
  walletState.update((s) => ({ ...s, connecting: true, error: null }));
  try {
    const wallet = await onboard();
    walletState.update((s) => ({
      ...s,
      wallet,
      walletType: type,
      address: wallet.address,
    }));
    log(`Connected: ${wallet.address}`, "success");
    await checkDeployment();
  } catch (err) {
    log(`${type} connection failed: ${err}`, "error");
    walletState.update((s) => ({ ...s, error: String(err) }));
  } finally {
    walletState.update((s) => ({ ...s, connecting: false }));
  }
}

export function connectCartridge(): Promise<void> {
  return connect("cartridge", async () => {
    const { wallet } = await sdk.onboard({
      strategy: OnboardStrategy.Cartridge,
      deploy: "never",
      cartridge: { policies: [CARTRIDGE_POLICY] },
      ...PROVIDER_OPTIONS,
    });
    privacy.clear();
    return wallet;
  });
}

export function connectPrivateKey(
  privateKey: string,
  presetName: string
): Promise<void> {
  return connect("privatekey", async () => {
    const preset = ACCOUNT_PRESETS[presetName];
    if (!preset) throw new Error(`Unknown account preset: ${presetName}`);
    const signer = new StarkSigner(privateKey.trim());
    const { wallet } = await sdk.onboard({
      strategy: OnboardStrategy.Signer,
      deploy: "never",
      account: { signer },
      accountPreset: preset,
      ...PROVIDER_OPTIONS,
    });
    // Establish the confidential capability now, while the key is in scope.
    privacy.init(privateKey.trim());
    return wallet;
  });
}

// Privy: register/fetch the user's wallet via the example server, then onboard
// with the remote signer. Requires `npm run dev:server` running.
export function connectPrivy(email: string, presetName: string): Promise<void> {
  return connect("privy", async () => {
    const preset = ACCOUNT_PRESETS[presetName];
    if (!preset) throw new Error(`Unknown account preset: ${presetName}`);
    const res = await fetch(`${PRIVY_SERVER_URL}/api/wallet/starknet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err.details || err.error || "Failed to register Privy user"
      );
    }
    const { wallet: walletData } = await res.json();
    const { wallet } = await sdk.onboard({
      strategy: OnboardStrategy.Privy,
      deploy: "never",
      accountPreset: preset,
      ...PROVIDER_OPTIONS,
      privy: {
        resolve: async () => ({
          walletId: walletData.id,
          publicKey: walletData.publicKey,
          serverUrl: `${PRIVY_SERVER_URL}/api/wallet/sign`,
        }),
      },
    });
    privacy.clear();
    return wallet;
  });
}

// Sign in automatically when VITE_PRIVATE_KEY is configured. No-op otherwise.
export function autoConnect(): Promise<void> {
  if (!AUTO_PRIVATE_KEY) return Promise.resolve();
  log(`Auto-connecting with ${AUTO_ACCOUNT_PRESET} account…`, "info");
  return connectPrivateKey(AUTO_PRIVATE_KEY, AUTO_ACCOUNT_PRESET);
}

export async function checkDeployment(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  try {
    const deployed = await wallet.isDeployed();
    if (get(walletState).wallet === wallet)
      walletState.update((s) => ({ ...s, isDeployed: deployed }));
  } catch {
    // leave deployment status unknown
  }
}

export async function deploy(): Promise<void> {
  const { wallet } = get(walletState);
  if (!wallet) return;
  walletState.update((s) => ({ ...s, connecting: true, error: null }));
  try {
    log("Deploying account…", "info");
    const tx = await wallet.deploy();
    await tx.wait();
    log("Account deployed", "success");
    await checkDeployment();
  } catch (err) {
    log(`Deploy failed: ${err}`, "error");
    walletState.update((s) => ({ ...s, error: String(err) }));
  } finally {
    walletState.update((s) => ({ ...s, connecting: false }));
  }
}

export function disconnect(): void {
  privacy.clear();
  walletState.set({
    wallet: null,
    walletType: null,
    address: null,
    isDeployed: null,
    connecting: false,
    error: null,
  });
}
