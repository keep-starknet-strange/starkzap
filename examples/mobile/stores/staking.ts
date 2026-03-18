import { create } from "zustand";
import { Alert } from "react-native";
import {
  sepoliaValidators,
  mainnetValidators,
  Amount,
  type Validator,
  type PoolMember,
  type Pool,
  type Token,
  type ChainId,
  type WalletInterface,
  type StarkZap,
} from "@starkzap/native";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";

/** Get explorer URL for a transaction hash */
function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl = chainId.isSepolia()
    ? "https://sepolia.voyager.online/tx"
    : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}

// Get validators for network
export function getValidatorsForNetwork(
  chainId: ChainId
): Record<string, Validator> {
  return chainId.isSepolia() ? sepoliaValidators : mainnetValidators;
}

/** Data for a single staking position (validator + token combination) */
export interface StakingPosition {
  /** Unique key: validatorKey:tokenAddress */
  key: string;
  validatorKey: string;
  validator: Validator;
  token: Token;
  pool: Pool;
  chainId: ChainId;
  position: PoolMember | null;
  isMember: boolean;
  isLoading: boolean;
}

/** Cached pools for a validator */
export interface ValidatorPools {
  validator: Validator;
  pools: Pool[];
  isLoading: boolean;
}

interface StakingState {
  // Map of staking positions by key (validatorKey:tokenAddress)
  positions: Record<string, StakingPosition>;

  // Cached validator pools (for the pool picker)
  validatorPools: ValidatorPools | null;

  // Currently active position key (for modals)
  activePositionKey: string | null;

  // Stale async guard epoch (incremented on clearStaking)
  staleEpoch: number;

  // Global loading states for actions
  isLoadingPools: boolean;
  isStaking: boolean;
  isClaimingRewards: boolean;
  isExiting: boolean;

  // Actions
  fetchValidatorPools: (validator: Validator, sdk: StarkZap) => Promise<Pool[]>;
  addPosition: (
    validatorKey: string,
    validator: Validator,
    pool: Pool,
    wallet: WalletInterface,
    chainId: ChainId
  ) => Promise<void>;
  removePosition: (key: string) => void;
  loadPosition: (key: string, wallet: WalletInterface) => Promise<void>;
  loadAllPositions: (wallet: WalletInterface) => Promise<void>;
  setActivePosition: (key: string | null) => void;
  clearValidatorPools: () => void;
  stake: (
    key: string,
    wallet: WalletInterface,
    amount: string,
    addLog: (msg: string) => void
  ) => Promise<void>;
  addStake: (
    key: string,
    wallet: WalletInterface,
    amount: string,
    addLog: (msg: string) => void
  ) => Promise<void>;
  claimRewards: (
    key: string,
    wallet: WalletInterface,
    addLog: (msg: string) => void
  ) => Promise<void>;
  exitIntent: (
    key: string,
    wallet: WalletInterface,
    amount: string,
    addLog: (msg: string) => void
  ) => Promise<void>;
  exit: (
    key: string,
    wallet: WalletInterface,
    addLog: (msg: string) => void
  ) => Promise<void>;
  clearStaking: () => void;
}

/** Generate a unique key for a position */
function makePositionKey(validatorKey: string, token: Token): string {
  return `${validatorKey}:${token.address}`;
}

export const useStakingStore = create<StakingState>((set, get) => ({
  positions: {},
  validatorPools: null,
  activePositionKey: null,
  staleEpoch: 0,
  isLoadingPools: false,
  isStaking: false,
  isClaimingRewards: false,
  isExiting: false,

  fetchValidatorPools: async (validator, sdk) => {
    const epoch = get().staleEpoch;
    set({
      isLoadingPools: true,
      validatorPools: { validator, pools: [], isLoading: true },
    });

    try {
      const pools = await sdk.getStakerPools(validator.stakerAddress);
      if (get().staleEpoch !== epoch) return [];
      set({
        validatorPools: { validator, pools, isLoading: false },
        isLoadingPools: false,
      });
      return pools;
    } catch (error) {
      console.error("Failed to fetch validator pools:", error);
      if (get().staleEpoch !== epoch) return [];
      set({ validatorPools: null, isLoadingPools: false });
      Alert.alert(
        "Error",
        "Failed to fetch available tokens for this validator"
      );
      return [];
    }
  },

  clearValidatorPools: () => {
    set({ validatorPools: null });
  },

  addPosition: async (validatorKey, validator, pool, wallet, chainId) => {
    const key = makePositionKey(validatorKey, pool.token);

    // Check if already added
    if (get().positions[key]) {
      Alert.alert(
        "Already Added",
        `You already have a ${pool.token.symbol} position with ${validator.name}`
      );
      return;
    }

    try {
      // Add to positions with loading state
      set((state) => ({
        positions: {
          ...state.positions,
          [key]: {
            key,
            validatorKey,
            validator,
            token: pool.token,
            pool,
            chainId,
            position: null,
            isMember: false,
            isLoading: true,
          },
        },
      }));

      // Load the position using wallet's staking methods
      await get().loadPosition(key, wallet);
    } catch (error) {
      console.error("Failed to add position:", error);
      Alert.alert("Error", "Failed to add staking position");
    }
  },

  removePosition: (key) => {
    set((state) => {
      const { [key]: _, ...rest } = state.positions;
      return {
        positions: rest,
        activePositionKey:
          state.activePositionKey === key ? null : state.activePositionKey,
      };
    });
  },

  loadPosition: async (key, wallet) => {
    const epoch = get().staleEpoch;
    const positionData = get().positions[key];
    if (!positionData) return;

    set((state) => ({
      positions: {
        ...state.positions,
        [key]: { ...state.positions[key], isLoading: true },
      },
    }));

    try {
      const poolAddress = positionData.pool.poolContract;
      const [position, isMember] = await Promise.all([
        wallet.getPoolPosition(poolAddress),
        wallet.isPoolMember(poolAddress),
      ]);

      if (get().staleEpoch !== epoch) return;
      set((state) => ({
        positions: {
          ...state.positions,
          [key]: {
            ...state.positions[key],
            position,
            isMember,
            isLoading: false,
          },
        },
      }));
    } catch (error) {
      console.error("Failed to load position:", error);
      if (get().staleEpoch !== epoch) return;
      set((state) => ({
        positions: {
          ...state.positions,
          [key]: {
            ...state.positions[key],
            position: null,
            isMember: false,
            isLoading: false,
          },
        },
      }));
    }
  },

  loadAllPositions: async (wallet) => {
    const epoch = get().staleEpoch;
    const { positions } = get();
    await Promise.all(
      Object.keys(positions).map(async (key) => {
        if (get().staleEpoch !== epoch) return;
        await get().loadPosition(key, wallet);
      })
    );
  },

  setActivePosition: (key) => {
    set({ activePositionKey: key });
  },

  stake: async (key, wallet, amountStr, addLog) => {
    const epoch = get().staleEpoch;
    const positionData = get().positions[key];
    if (!positionData) return;

    set({ isStaking: true });
    addLog(
      `Staking ${positionData.token.symbol} to ${positionData.validator.name}...`
    );

    try {
      const amount = Amount.parse(amountStr, positionData.token);
      const poolAddress = positionData.pool.poolContract;

      const tx = await wallet.enterPool(poolAddress, amount);
      addLog(`Stake tx submitted: ${tx.hash.slice(0, 10)}...`);

      // Show pending toast
      showTransactionToast(
        {
          txHash: tx.hash,
          title: "Staking",
          subtitle: `Staking ${amountStr} ${positionData.token.symbol} to ${positionData.validator.name}`,
          explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      // Update toast to success
      updateTransactionToast({
        txHash: tx.hash,
        title: "Stake Successful",
        subtitle: `Staked ${amountStr} ${positionData.token.symbol} to ${positionData.validator.name}`,
        explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
      });

      addLog("Stake successful!");
      if (get().staleEpoch !== epoch) return;
      await get().loadPosition(key, wallet);
    } catch (error) {
      addLog(`Stake failed: ${error}`);
      if (get().staleEpoch !== epoch) return;
      Alert.alert("Stake Failed", String(error));
    } finally {
      if (get().staleEpoch === epoch) set({ isStaking: false });
    }
  },

  addStake: async (key, wallet, amountStr, addLog) => {
    const epoch = get().staleEpoch;
    const positionData = get().positions[key];
    if (!positionData) return;

    set({ isStaking: true });
    addLog(
      `Adding ${positionData.token.symbol} stake to ${positionData.validator.name}...`
    );

    try {
      const amount = Amount.parse(amountStr, positionData.token);
      const poolAddress = positionData.pool.poolContract;

      const tx = await wallet.addToPool(poolAddress, amount);
      addLog(`Add stake tx submitted: ${tx.hash.slice(0, 10)}...`);

      // Show pending toast
      showTransactionToast(
        {
          txHash: tx.hash,
          title: "Adding Stake",
          subtitle: `Adding ${amountStr} ${positionData.token.symbol} to ${positionData.validator.name}`,
          explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      // Update toast to success
      updateTransactionToast({
        txHash: tx.hash,
        title: "Added Stake",
        subtitle: `Added ${amountStr} ${positionData.token.symbol} to ${positionData.validator.name}`,
        explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
      });

      addLog("Added stake successfully!");
      if (get().staleEpoch !== epoch) return;
      await get().loadPosition(key, wallet);
    } catch (error) {
      addLog(`Add stake failed: ${error}`);
      if (get().staleEpoch !== epoch) return;
      Alert.alert("Add Stake Failed", String(error));
    } finally {
      if (get().staleEpoch === epoch) set({ isStaking: false });
    }
  },

  claimRewards: async (key, wallet, addLog) => {
    const epoch = get().staleEpoch;
    const positionData = get().positions[key];
    if (!positionData) return;

    set({ isClaimingRewards: true });
    addLog(
      `Claiming ${positionData.token.symbol} rewards from ${positionData.validator.name}...`
    );

    try {
      const poolAddress = positionData.pool.poolContract;

      const tx = await wallet.claimPoolRewards(poolAddress);
      addLog(`Claim tx submitted: ${tx.hash.slice(0, 10)}...`);

      // Show pending toast
      showTransactionToast(
        {
          txHash: tx.hash,
          title: "Claiming Rewards",
          subtitle: `Claiming ${positionData.token.symbol} rewards from ${positionData.validator.name}`,
          explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      // Update toast to success
      updateTransactionToast({
        txHash: tx.hash,
        title: "Rewards Claimed",
        subtitle: `Claimed ${positionData.token.symbol} rewards from ${positionData.validator.name}`,
        explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
      });

      addLog("Rewards claimed successfully!");
      if (get().staleEpoch !== epoch) return;
      await get().loadPosition(key, wallet);
    } catch (error) {
      addLog(`Claim failed: ${error}`);
      if (get().staleEpoch !== epoch) return;
      Alert.alert("Claim Failed", String(error));
    } finally {
      if (get().staleEpoch === epoch) set({ isClaimingRewards: false });
    }
  },

  exitIntent: async (key, wallet, amountStr, addLog) => {
    const epoch = get().staleEpoch;
    const positionData = get().positions[key];
    if (!positionData) return;

    set({ isExiting: true });
    addLog(
      `Initiating exit from ${positionData.validator.name} (${positionData.token.symbol})...`
    );

    try {
      const amount = Amount.parse(amountStr, positionData.token);
      const poolAddress = positionData.pool.poolContract;

      const tx = await wallet.exitPoolIntent(poolAddress, amount);
      addLog(`Exit intent tx submitted: ${tx.hash.slice(0, 10)}...`);

      // Show pending toast
      showTransactionToast(
        {
          txHash: tx.hash,
          title: "Exit Intent",
          subtitle: `Initiating exit of ${amountStr} ${positionData.token.symbol} from ${positionData.validator.name}`,
          explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      // Update toast to success
      updateTransactionToast({
        txHash: tx.hash,
        title: "Exit Intent Registered",
        subtitle: `Exit intent for ${amountStr} ${positionData.token.symbol} from ${positionData.validator.name}`,
        explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
      });

      addLog("Exit intent registered successfully!");
      if (get().staleEpoch !== epoch) return;
      await get().loadPosition(key, wallet);
    } catch (error) {
      addLog(`Exit intent failed: ${error}`);
      if (get().staleEpoch !== epoch) return;
      Alert.alert("Exit Intent Failed", String(error));
    } finally {
      if (get().staleEpoch === epoch) set({ isExiting: false });
    }
  },

  exit: async (key, wallet, addLog) => {
    const epoch = get().staleEpoch;
    const positionData = get().positions[key];
    if (!positionData) return;

    set({ isExiting: true });
    addLog(
      `Completing exit from ${positionData.validator.name} (${positionData.token.symbol})...`
    );

    try {
      const poolAddress = positionData.pool.poolContract;

      const tx = await wallet.exitPool(poolAddress);
      addLog(`Exit tx submitted: ${tx.hash.slice(0, 10)}...`);

      // Show pending toast
      showTransactionToast(
        {
          txHash: tx.hash,
          title: "Exiting",
          subtitle: `Completing exit from ${positionData.validator.name} (${positionData.token.symbol})`,
          explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      // Update toast to success
      updateTransactionToast({
        txHash: tx.hash,
        title: "Exit Complete",
        subtitle: `Exited from ${positionData.validator.name}. ${positionData.token.symbol} returned to wallet.`,
        explorerUrl: getExplorerUrl(tx.hash, positionData.chainId),
      });

      addLog("Exit completed successfully! Tokens returned to wallet.");
      if (get().staleEpoch !== epoch) return;
      await get().loadPosition(key, wallet);
    } catch (error) {
      addLog(`Exit failed: ${error}`);
      if (get().staleEpoch !== epoch) return;
      Alert.alert("Exit Failed", String(error));
    } finally {
      if (get().staleEpoch === epoch) set({ isExiting: false });
    }
  },

  clearStaking: () => {
    set({
      positions: {},
      validatorPools: null,
      activePositionKey: null,
      staleEpoch: get().staleEpoch + 1,
    });
  },
}));
