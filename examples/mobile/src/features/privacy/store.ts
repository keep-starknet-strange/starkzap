import { create } from "zustand";
import {
  Amount,
  fromAddress,
  type ConfidentialProvider,
  type ConfidentialRecipient,
  type ConfidentialRolloverDetails,
} from "starkzap-native";
import type { Call, RpcProvider } from "starknet";
import { useWalletStore } from "@/core/wallet/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import {
  PRIVACY_PROVIDERS,
  type PrivacyProviderDef,
  type PrivacyToken,
} from "./providers";

// rollover is a Tongo extra, not part of the base ConfidentialProvider — treat
// it as an optional capability so other providers (e.g. STRK20) can omit it.
type MaybeRollover = {
  rollover?: (details: ConfidentialRolloverDetails) => Promise<Call[]>;
};

// Mints a confidential provider for a token; created at login so it can close
// over the private key without the store ever holding it as plain state.
type Make = (
  def: PrivacyProviderDef,
  token: PrivacyToken,
  rpc: RpcProvider
) => ConfidentialProvider;

interface PrivacyStore {
  make: Make | null; // null unless logged in with a private key
  providerId: string;
  tokenSymbol: string;
  instance: ConfidentialProvider | null;
  token: PrivacyToken | null;
  connecting: boolean;
  busy: boolean;
  address: string;
  recipient: ConfidentialRecipient | null;
  balance: bigint;
  pending: bigint;
  error: string | null;

  init: (privateKey: string) => void;
  clear: () => void;
  setProvider: (id: string) => void;
  setToken: (symbol: string) => void;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  fund: (amount: string) => Promise<void>;
  withdraw: (amount: string) => Promise<void>;
  transfer: (amount: string, x: string, y: string) => Promise<void>;
  rollover: () => Promise<void>;
}

const CLEARED = {
  instance: null,
  token: null,
  address: "",
  recipient: null,
  balance: 0n,
  pending: 0n,
  error: null,
};

export const usePrivacyStore = create<PrivacyStore>((set, get) => ({
  make: null,
  providerId: PRIVACY_PROVIDERS[0]?.id ?? "tongo",
  tokenSymbol: "",
  ...CLEARED,
  connecting: false,
  busy: false,

  init: (privateKey) =>
    set({
      make: (def, token, rpc) =>
        def.create({ token, privateKey, provider: rpc }),
    }),
  clear: () => set({ make: null, tokenSymbol: "", ...CLEARED }),
  setProvider: (id) => set({ providerId: id, ...CLEARED }),
  setToken: (symbol) => set({ tokenSymbol: symbol, ...CLEARED }),

  connect: async () => {
    const { wallet, networkIndex } = useWalletStore.getState();
    const { make, providerId, tokenSymbol } = get();
    const def = PRIVACY_PROVIDERS.find((p) => p.id === providerId);
    const token = def
      ?.tokensForNetwork(networkIndex)
      .find((t) => t.symbol === tokenSymbol);
    if (!wallet || !make || !def || !token) return;
    set({ connecting: true, error: null });
    try {
      const instance = make(def, token, wallet.getProvider());
      set({
        instance,
        token,
        address: instance.address,
        recipient: instance.recipientId,
      });
      await get().refresh();
    } catch (err) {
      set({ error: String(err), instance: null });
    } finally {
      set({ connecting: false });
    }
  },
  refresh: async () => {
    const { instance } = get();
    if (!instance) return;
    try {
      const state = await instance.getState();
      const [balance, pending] = await Promise.all([
        instance.toPublicUnits(state.balance),
        instance.toPublicUnits(state.pending),
      ]);
      set({ balance, pending });
    } catch (err) {
      set({ error: String(err) });
    }
  },
  fund: async (amount) => {
    const { wallet } = useWalletStore.getState();
    const { instance, token } = get();
    if (!wallet || !instance || !token || !amount.trim()) return;
    set({ busy: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Shield ${token.symbol}`, async () => {
        const calls = await instance.fund({
          amount: Amount.parse(amount, token.decimals, token.symbol),
          sender: wallet.address,
        });
        return wallet.execute(calls);
      });
    set({ busy: false });
    if (tx) await get().refresh();
  },
  // Unshield always returns funds to our own wallet address.
  withdraw: async (amount) => {
    const { wallet } = useWalletStore.getState();
    const { instance, token } = get();
    if (!wallet || !instance || !token || !amount.trim()) return;
    set({ busy: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Unshield ${token.symbol}`, async () => {
        const calls = await instance.withdraw({
          amount: Amount.parse(amount, token.decimals, token.symbol),
          to: fromAddress(wallet.address),
          sender: wallet.address,
        });
        return wallet.execute(calls);
      });
    set({ busy: false });
    if (tx) await get().refresh();
  },
  transfer: async (amount, x, y) => {
    const { wallet } = useWalletStore.getState();
    const { instance, token } = get();
    if (
      !wallet ||
      !instance ||
      !token ||
      !amount.trim() ||
      !x.trim() ||
      !y.trim()
    )
      return;
    set({ busy: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Private send ${token.symbol}`, async () => {
        const calls = await instance.transfer({
          amount: Amount.parse(amount, token.decimals, token.symbol),
          to: { x: x.trim(), y: y.trim() },
          sender: wallet.address,
        });
        return wallet.execute(calls);
      });
    set({ busy: false });
    if (tx) await get().refresh();
  },
  rollover: async () => {
    const { wallet } = useWalletStore.getState();
    const roller = get().instance as
      | (ConfidentialProvider & MaybeRollover)
      | null;
    if (!wallet || !roller?.rollover) return;
    set({ busy: true });
    const tx = await useTxBannerStore
      .getState()
      .notify("Rollover", async () => {
        const calls = await roller.rollover!({ sender: wallet.address });
        return wallet.execute(calls);
      });
    set({ busy: false });
    if (tx) await get().refresh();
  },
}));
