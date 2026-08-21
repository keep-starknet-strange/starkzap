import { create } from "zustand";
import {
  Amount,
  TongoConfidential,
  fromAddress,
  type ConfidentialRecipient,
} from "starkzap-native";
import type { RpcProvider } from "starknet";
import { useWalletStore } from "@/core/wallet/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import { tongoTokens, type PrivacyToken } from "./tokens";

// Mints a confidential account for a token; created at login so it can close
// over the private key without the store ever holding it as plain state.
type Make = (
  token: PrivacyToken,
  rpc: RpcProvider
) => Promise<TongoConfidential>;

interface PrivacyStore {
  make: Make | null; // null unless logged in with a private key
  tokenSymbol: string;
  instance: TongoConfidential | null;
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
  tokenSymbol: "",
  ...CLEARED,
  connecting: false,
  busy: false,

  init: (privateKey) =>
    set({
      make: (token, rpc) =>
        TongoConfidential.create({
          privateKey,
          contractAddress: fromAddress(token.contractAddress),
          provider: rpc,
        }),
    }),
  clear: () => set({ make: null, tokenSymbol: "", ...CLEARED }),
  setToken: (symbol) => set({ tokenSymbol: symbol, ...CLEARED }),

  connect: async () => {
    const { wallet, networkIndex } = useWalletStore.getState();
    const { make, tokenSymbol } = get();
    const token = tongoTokens(networkIndex).find(
      (t) => t.symbol === tokenSymbol
    );
    if (!wallet || !make || !token) return;
    set({ connecting: true, error: null });
    try {
      const instance = await make(token, wallet.getProvider());
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
    const roller = get().instance;
    if (!wallet || !roller) return;
    set({ busy: true });
    const tx = await useTxBannerStore
      .getState()
      .notify("Rollover", async () => {
        const calls = await roller.rollover({ sender: wallet.address });
        return wallet.execute(calls);
      });
    set({ busy: false });
    if (tx) await get().refresh();
  },
}));
