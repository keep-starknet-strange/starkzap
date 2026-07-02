import { create } from "zustand";
import {
  Amount,
  mainnetValidators,
  sepoliaValidators,
  type Pool,
  type PoolMember,
  type Validator,
} from "starkzap-native";
import { NETWORKS } from "@/core/network";
import { useWalletStore } from "@/core/wallet/store";
import { useTxBannerStore } from "@/core/tx-banner/store";
import type { DryRunResult } from "@/core/errors";

export function validatorsForNetwork(
  networkIndex: number
): Record<string, Validator> {
  return NETWORKS[networkIndex].chainId.isSepolia()
    ? sepoliaValidators
    : mainnetValidators;
}

export interface DelegatePosition {
  validator: Validator;
  pool: Pool;
  member: PoolMember | null;
}

interface DelegateStore {
  // Add/stake form.
  validatorKey: string;
  pools: Pool[];
  loadingPools: boolean;
  poolContract: string;
  amount: string;
  submitting: boolean;
  dryRunning: boolean;
  dryRunResult: DryRunResult | null;
  // Tracked positions.
  positions: DelegatePosition[];
  busyPool: string | null;

  selectValidator: (key: string) => Promise<void>;
  setPool: (poolContract: string) => void;
  setAmount: (value: string) => void;
  stake: () => Promise<void>;
  dryRun: () => Promise<void>;
  refresh: () => Promise<void>;
  claim: (position: DelegatePosition) => Promise<void>;
  exitIntent: (position: DelegatePosition) => Promise<void>;
  exit: (position: DelegatePosition) => Promise<void>;
}

function selectedValidator(): Validator | undefined {
  const { networkIndex } = useWalletStore.getState();
  return validatorsForNetwork(networkIndex)[
    useDelegateStore.getState().validatorKey
  ];
}

export const useDelegateStore = create<DelegateStore>((set, get) => ({
  validatorKey: "",
  pools: [],
  loadingPools: false,
  poolContract: "",
  amount: "",
  submitting: false,
  dryRunning: false,
  dryRunResult: null,
  positions: [],
  busyPool: null,

  selectValidator: async (key) => {
    const { sdk, networkIndex } = useWalletStore.getState();
    const validator = validatorsForNetwork(networkIndex)[key];
    set({
      validatorKey: key,
      pools: [],
      poolContract: "",
      loadingPools: true,
      dryRunResult: null,
    });
    if (!sdk || !validator) {
      set({ loadingPools: false });
      return;
    }
    try {
      // A validator can expose several token pools (STRK, BTC, …).
      const pools = await sdk.getStakerPools(validator.stakerAddress);
      set({ pools, poolContract: pools[0]?.poolContract ?? "" });
    } catch {
      set({ pools: [] });
    } finally {
      set({ loadingPools: false });
    }
  },
  setPool: (poolContract) => set({ poolContract, dryRunResult: null }),
  setAmount: (value) => set({ amount: value, dryRunResult: null }),

  stake: async () => {
    const { wallet } = useWalletStore.getState();
    const { pools, poolContract, amount } = get();
    const pool = pools.find((p) => p.poolContract === poolContract);
    const validator = selectedValidator();
    if (!wallet || !pool || !validator || !amount.trim()) return;
    set({ submitting: true });
    const tx = await useTxBannerStore
      .getState()
      .notify(`Stake ${pool.token.symbol}`, () =>
        wallet.stake(pool.poolContract, Amount.parse(amount, pool.token))
      );
    set({ submitting: false });
    if (tx) {
      set((s) => ({
        amount: "",
        positions: s.positions.some(
          (p) => p.pool.poolContract === pool.poolContract
        )
          ? s.positions
          : [...s.positions, { validator, pool, member: null }],
      }));
      await get().refresh();
    }
  },
  dryRun: async () => {
    const { wallet } = useWalletStore.getState();
    const { pools, poolContract, amount } = get();
    const pool = pools.find((p) => p.poolContract === poolContract);
    if (!wallet || !pool || !amount.trim()) return;
    set({ dryRunning: true, dryRunResult: null });
    try {
      const result = await wallet
        .tx()
        .stake(pool.poolContract, Amount.parse(amount, pool.token))
        .preflight();
      set({
        dryRunResult: result.ok
          ? {
              ok: true,
              message: "Simulation passed — the stake would succeed.",
            }
          : { ok: false, message: result.reason },
      });
    } catch (err) {
      set({ dryRunResult: { ok: false, message: String(err) } });
    } finally {
      set({ dryRunning: false });
    }
  },
  refresh: async () => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    const positions = await Promise.all(
      get().positions.map(async (p) => ({
        ...p,
        member: await wallet
          .getPoolPosition(p.pool.poolContract)
          .catch(() => null),
      }))
    );
    set({ positions });
  },
  claim: async (position) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ busyPool: position.pool.poolContract });
    const tx = await useTxBannerStore
      .getState()
      .notify("Claim rewards", () =>
        wallet.claimPoolRewards(position.pool.poolContract)
      );
    if (tx) await get().refresh();
    set({ busyPool: null });
  },
  exitIntent: async (position) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet || !position.member) return;
    set({ busyPool: position.pool.poolContract });
    const tx = await useTxBannerStore
      .getState()
      .notify("Exit intent", () =>
        wallet.exitPoolIntent(
          position.pool.poolContract,
          position.member!.staked
        )
      );
    if (tx) await get().refresh();
    set({ busyPool: null });
  },
  exit: async (position) => {
    const { wallet } = useWalletStore.getState();
    if (!wallet) return;
    set({ busyPool: position.pool.poolContract });
    const tx = await useTxBannerStore
      .getState()
      .notify("Exit pool", () => wallet.exitPool(position.pool.poolContract));
    if (tx) await get().refresh();
    set({ busyPool: null });
  },
}));
