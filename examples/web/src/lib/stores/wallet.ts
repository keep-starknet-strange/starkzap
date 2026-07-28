import { writable, get } from "svelte/store";
import {
  StarkZap,
  StarkSigner,
  OnboardStrategy,
  type WalletInterface,
  AvnuSwapProvider,
  EkuboSwapProvider,
  AvnuDcaProvider,
  EkuboDcaProvider,
} from "starkzap";
import {
  RPC_URL,
  CHAIN_ID,
  buildBridgingConfig,
  ACCOUNT_PRESETS,
  PRIVY_SERVER_URL,
  AUTO_PRIVATE_KEY,
  AUTO_ACCOUNT_PRESET,
  PRIVACY_CONFIG,
} from "./config";
import { sdkLogger, log } from "./logger";
import * as privacy from "~/features/privacy/store";
import {
  getAccessToken as getPrivyAccessToken,
  init as privyInit,
  loggedIn as privyLoggedIn,
} from "./privy";

export type WalletType = "cartridge" | "privatekey" | "privy";

// Remembers the last login so the app can resume on reload. Only the method and
// preset are stored — never a private key (see resumeSession / no-raw-key rule).
const LOGIN_STORAGE_KEY = "starkzap:example:login";
type LoginHint = {
  walletType: WalletType;
  presetName?: string;
  // Account resumed into — used to reject an env key that resolves elsewhere.
  address?: string;
};

function saveHint(hint: LoginHint): void {
  try {
    localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(hint));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

export function getSessionHint(): LoginHint | null {
  try {
    const raw = localStorage.getItem(LOGIN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LoginHint) : null;
  } catch {
    return null;
  }
}

function clearHint(): void {
  try {
    localStorage.removeItem(LOGIN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// STRK — same address on mainnet and sepolia. Minimal Cartridge session scope.
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const CARTRIDGE_POLICY = { target: STRK_ADDRESS, method: "transfer" };

const swapProviders = [new AvnuSwapProvider(), new EkuboSwapProvider()];
const dcaProviders = [new AvnuDcaProvider(), new EkuboDcaProvider()];

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
  // Enables wallet.privacy() on locally-signed wallets. Absent when this
  // network has no VITE_PRIVACY_* endpoints configured.
  ...(PRIVACY_CONFIG ? { privacy: PRIVACY_CONFIG } : {}),
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
  onboard: () => Promise<WalletInterface>,
  presetName?: string
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
    saveHint({
      walletType: type,
      address: wallet.address,
      ...(presetName ? { presetName } : {}),
    });
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
  presetName: string,
  expectedAddress?: string
): Promise<void> {
  return connect(
    "privatekey",
    async () => {
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
      // Guard the resume path: refuse if this key/preset resolves to a different
      // account than the one we saved (e.g. env key changed since last login).
      if (expectedAddress && wallet.address !== expectedAddress) {
        throw new Error(
          "Configured key resolves to a different account than your last login."
        );
      }
      // Establish the confidential capability now, while the key is in scope.
      privacy.init(privateKey.trim());
      return wallet;
    },
    presetName
  );
}

// Privy: the user logs in with Privy in-browser first (see privy store) to get
// an access token; the example server verifies it, returns/creates the Starknet
// wallet, then the SDK signs remotely via the server. Requires `npm run dev:server`.
export function connectPrivy(presetName: string): Promise<void> {
  return connect(
    "privy",
    async () => {
      const preset = ACCOUNT_PRESETS[presetName];
      if (!preset) throw new Error(`Unknown account preset: ${presetName}`);
      const token = await getPrivyAccessToken();
      if (!token) throw new Error("Log in with Privy first.");
      const res = await fetch(`${PRIVY_SERVER_URL}/api/privy-wallet/starknet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.details || err.error || "Failed to fetch Privy wallet"
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
            serverUrl: `${PRIVY_SERVER_URL}/api/privy-wallet/sign`,
          }),
        },
      });
      privacy.clear();
      return wallet;
    },
    presetName
  );
}

// Restore the last session on startup. Privy resumes silently via its stored
// token; Cartridge reuses a live keychain session (a stale one reopens login).
// Private key can't resume without storing the secret — it auto-logins only
// from the env key, and only when that key resolves to the same account we
// saved (else the login form preselects the remembered method — see below).
export async function resumeSession(): Promise<void> {
  const hint = getSessionHint();
  if (!hint) return;
  if (hint.walletType === "privatekey") {
    if (AUTO_PRIVATE_KEY) {
      const preset = hint.presetName ?? AUTO_ACCOUNT_PRESET;
      log(`Auto-connecting with ${preset} account…`, "info");
      await connectPrivateKey(AUTO_PRIVATE_KEY, preset, hint.address);
    }
    return;
  }
  if (hint.walletType === "cartridge") {
    await connectCartridge();
    return;
  }
  if (hint.walletType === "privy") {
    await privyInit(); // restore any saved Privy session
    if (get(privyLoggedIn)) {
      await connectPrivy(hint.presetName ?? Object.keys(ACCOUNT_PRESETS)[0]!);
    }
  }
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
  clearHint();
  walletState.set({
    wallet: null,
    walletType: null,
    address: null,
    isDeployed: null,
    connecting: false,
    error: null,
  });
}
