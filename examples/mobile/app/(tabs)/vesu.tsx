import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  type ViewStyle,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { usePrivy } from "@privy-io/expo";

import {
  Amount,
  type LendingMarket,
  type LendingPosition,
  type LendingUserPosition,
  type Tx,
} from "@starkzap/native";
import { ActionPills } from "@/components/ActionPills";
import { DropdownField, type DropdownOption } from "@/components/DropdownField";
import { LogsFAB } from "@/components/LogsFAB";
import {
  showCopiedToast,
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getTokensForNetwork, useBalancesStore } from "@/stores/balances";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import { cropAddress, getExplorerUrl } from "@/utils";
import {
  AmountField,
  MarketCardView,
  MetricsGrid,
  PercentField,
  PoolAvatar,
  PositionHealthCard,
  SecondaryButton,
  SubmitButton,
  TokenAvatar,
} from "@/vesu/components";
import { styles } from "@/vesu/styles";
import {
  PERCENT_SCALE,
  amountFromBase,
  formatPercentInput,
  getAmountError,
  getExecuteOptions,
  getPercentError,
  parseAmountInput,
  parsePercentInput,
} from "@/vesu/utils";
import {
  buildVesuAssetOptions,
  buildVesuMarketCards,
  fetchVesuPoolData,
  getAvailableVesuDebtAssets,
  getDefaultVesuDebtAsset,
  getVesuBorrowCapacityForDeposit,
  getVesuCloseRepayAmount,
  getVesuHealthStatus,
  getVesuMinimumDepositForBorrow,
  getVesuPoolLabel,
  getVesuRepaySubmissionAmount,
  getVesuUserPositionForMarket,
  hasVesuExposure,
  VESU_PROVIDER_ID,
  type VesuAssetOption,
  type VesuPoolData,
} from "@/vesu";

type VaultAction = "deposit" | "withdraw";
type PositionAction = "borrow" | "repay";
type MarketSheetTab = "supply" | "borrow";

const EMPTY_STATE_LABEL = "—";
const SUPPORTED_VESU_CHAINS = new Set(["SN_MAIN", "SN_SEPOLIA"]);
const VAULT_ACTIONS = ["deposit", "withdraw"] as const;
const POSITION_ACTIONS = ["borrow", "repay"] as const;

export default function VesuScreen() {
  const {
    wallet,
    chainId,
    addLog,
    paymasterNodeUrl,
    preferSponsored,
    walletType,
    disconnect,
    resetNetworkConfig,
  } = useWalletStore();
  const { logout } = usePrivy();
  const {
    getBalance,
    fetchBalances,
    clearBalances,
    isLoading: isLoadingBalances,
  } = useBalancesStore();
  const { width } = useWindowDimensions();

  // Market state
  const [markets, setMarkets] = useState<LendingMarket[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Selection state
  const [selectedVaultAssetKey, setSelectedVaultAssetKey] = useState<
    string | null
  >(null);
  const [selectedBorrowAssetKey, setSelectedBorrowAssetKey] = useState<
    string | null
  >(null);

  // User positions (from Vesu indexer API)
  const [userPositions, setUserPositions] = useState<LendingUserPosition[]>([]);

  // Position state
  const [position, setPosition] = useState<LendingPosition | null>(null);
  const [health, setHealth] = useState<LendingHealth | null>(null);
  const [maxBorrowAmount, setMaxBorrowAmount] = useState<bigint | null>(null);
  const [isRefreshingPosition, setIsRefreshingPosition] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [selectedPoolData, setSelectedPoolData] = useState<VesuPoolData | null>(
    null
  );

  // Form state — consolidated for borrow/repay
  const [vaultAction, setVaultAction] = useState<VaultAction>("deposit");
  const [positionAction, setPositionAction] =
    useState<PositionAction>("borrow");
  const [vaultAmount, setVaultAmount] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowPercent, setBorrowPercent] = useState("");
  const [borrowDriver, setBorrowDriver] = useState<"debt" | "percent" | null>(
    null
  );
  const [useExistingSupply, setUseExistingSupply] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMarketSheetOpen, setIsMarketSheetOpen] = useState(false);
  const [marketSheetTab, setMarketSheetTab] =
    useState<MarketSheetTab>("supply");
  const [useSponsored, setUseSponsored] = useState(
    preferSponsored && Boolean(paymasterNodeUrl)
  );

  // Theme
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const backgroundColor = useThemeColor({}, "background");

  // Derived
  const allTokens = useMemo(() => getTokensForNetwork(chainId), [chainId]);
  const isVesuSupported = SUPPORTED_VESU_CHAINS.has(chainId.toLiteral());
  const canUseSponsored = Boolean(paymasterNodeUrl);
  const marketColumns = width >= 1200 ? 3 : width >= 760 ? 2 : 1;
  const columnWidth: ViewStyle["width"] =
    marketColumns === 1 ? "100%" : marketColumns === 2 ? "48.5%" : "32%";
  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const resetDraftState = useCallback(
    (options?: { keepVaultAmount?: boolean }) => {
      if (!options?.keepVaultAmount) {
        setVaultAmount("");
      }
      setDebtAmount("");
      setCollateralAmount("");
      setBorrowPercent("");
      setBorrowDriver(null);
    },
    []
  );

  // Reset form amounts when switching borrow/repay
  useEffect(() => {
    resetDraftState({ keepVaultAmount: true });
  }, [positionAction, resetDraftState]);

  const handleOpenMarket = useCallback(
    (option: VesuAssetOption, initialTab: MarketSheetTab = "supply") => {
      setSelectedVaultAssetKey(option.key);
      setSelectedBorrowAssetKey(null);
      setVaultAction("deposit");
      setPositionAction("borrow");
      setMarketSheetTab(
        option.canBorrow && initialTab === "borrow" ? "borrow" : "supply"
      );
      resetDraftState();
      setIsMarketSheetOpen(true);
    },
    [resetDraftState]
  );

  const handleCloseMarket = useCallback(() => {
    setIsMarketSheetOpen(false);
    setMarketSheetTab("supply");
    setSelectedVaultAssetKey(null);
    setSelectedBorrowAssetKey(null);
    setPosition(null);
    setHealth(null);
    setPositionError(null);
    setVaultAction("deposit");
    setPositionAction("borrow");
    resetDraftState();
  }, [resetDraftState]);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    if (walletType === "privy") await logout();
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [clearBalances, disconnect, resetNetworkConfig, walletType, logout]);

  useEffect(() => {
    setUseSponsored(preferSponsored && Boolean(paymasterNodeUrl));
  }, [paymasterNodeUrl, preferSponsored]);

  // Memo: asset options and market cards
  const assetOptions = useMemo(
    () => buildVesuAssetOptions({ markets, tokens: allTokens }),
    [allTokens, markets]
  );
  const marketCards = useMemo(
    () =>
      buildVesuMarketCards({
        options: assetOptions,
        markets,
        knownTokens: allTokens,
      }),
    [allTokens, markets, assetOptions]
  );

  // Memo: map market card keys to matching active positions
  const positionByCardKey = useMemo(() => {
    const map = new Map<string, LendingUserPosition>();
    for (const card of marketCards) {
      const position = getVesuUserPositionForMarket({
        userPositions,
        token: card.option.token,
        poolAddress: card.option.poolAddress,
      });
      if (position) {
        map.set(card.key, position);
      }
    }
    return map;
  }, [marketCards, userPositions]);

  // Memo: selected assets
  const selectedVaultAsset = useMemo(
    () =>
      selectedVaultAssetKey
        ? (assetOptions.find((o) => o.key === selectedVaultAssetKey) ?? null)
        : null,
    [assetOptions, selectedVaultAssetKey]
  );
  // In the borrow tab, the vault asset IS the collateral
  const selectedCollateralToken = selectedVaultAsset?.token ?? null;
  const debtOptions = useMemo(
    () => getAvailableVesuDebtAssets(assetOptions, selectedVaultAsset),
    [assetOptions, selectedVaultAsset]
  );
  const selectedDebtAsset = useMemo(
    () =>
      debtOptions.find((o) => o.key === selectedBorrowAssetKey) ??
      getDefaultVesuDebtAsset(debtOptions, selectedVaultAsset),
    [debtOptions, selectedBorrowAssetKey, selectedVaultAsset]
  );
  const selectedMarketCard = useMemo(
    () =>
      selectedVaultAssetKey
        ? (marketCards.find((c) => c.key === selectedVaultAssetKey) ?? null)
        : null,
    [marketCards, selectedVaultAssetKey]
  );

  useEffect(() => {
    if (!selectedVaultAsset?.poolAddress) {
      setSelectedPoolData(null);
      return;
    }

    let cancelled = false;
    void fetchVesuPoolData(selectedVaultAsset.poolAddress).then((pool) => {
      if (!cancelled) {
        setSelectedPoolData(pool);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedVaultAsset?.poolAddress]);

  // Balances
  const vaultBalance = selectedVaultAsset
    ? getBalance(selectedVaultAsset.token)
    : null;
  const debtWalletBalance = selectedDebtAsset
    ? getBalance(selectedDebtAsset.token)
    : null;

  // Deposited balance from Vesu indexer
  const depositedBalance = useMemo(() => {
    if (!selectedVaultAsset) return null;
    const pos = userPositions.find(
      (p) =>
        p.type === "earn" &&
        p.collateral.token.address === selectedVaultAsset.token.address &&
        (!selectedVaultAsset.poolAddress ||
          p.pool.id === selectedVaultAsset.poolAddress)
    );
    if (!pos) return null;
    return Amount.fromRaw(pos.collateral.amount, pos.collateral.token);
  }, [selectedVaultAsset, userPositions]);

  const parsedDebtAmount = useMemo(
    () => parseAmountInput(debtAmount, selectedDebtAsset?.token ?? null),
    [debtAmount, selectedDebtAsset]
  );
  const parsedCollateralAmount = useMemo(
    () => parseAmountInput(collateralAmount, selectedCollateralToken),
    [collateralAmount, selectedCollateralToken]
  );

  const hasBorrowExposure = hasVesuExposure(position);
  const hasExistingSupplyCapacity =
    useExistingSupply && maxBorrowAmount != null && maxBorrowAmount > 0n;
  const canBorrowAgainstCurrentCollateral =
    hasBorrowExposure || hasExistingSupplyCapacity;

  const draftMaxBorrowAmount = useMemo(() => {
    if (
      positionAction !== "borrow" ||
      !selectedCollateralToken ||
      !selectedDebtAsset
    ) {
      return maxBorrowAmount;
    }
    return getVesuBorrowCapacityForDeposit({
      pool: selectedPoolData,
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
      depositAmount: parsedCollateralAmount,
      currentMaxBorrowAmount: maxBorrowAmount,
    });
  }, [
    maxBorrowAmount,
    parsedCollateralAmount,
    positionAction,
    selectedCollateralToken,
    selectedDebtAsset,
    selectedPoolData,
  ]);

  const minimumRequiredDeposit = useMemo(() => {
    if (
      positionAction !== "borrow" ||
      !selectedCollateralToken ||
      !selectedDebtAsset
    ) {
      return 0n;
    }
    return getVesuMinimumDepositForBorrow({
      pool: selectedPoolData,
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
      borrowAmount: parsedDebtAmount,
      currentMaxBorrowAmount: maxBorrowAmount,
    });
  }, [
    maxBorrowAmount,
    parsedDebtAmount,
    positionAction,
    selectedCollateralToken,
    selectedDebtAsset,
    selectedPoolData,
  ]);

  const vaultAmountError = getAmountError(
    vaultAmount,
    selectedVaultAsset?.token ?? null
  );
  const baseDebtAmountError = getAmountError(
    debtAmount,
    selectedDebtAsset?.token ?? null
  );
  const baseCollateralAmountError = getAmountError(
    collateralAmount,
    selectedCollateralToken
  );
  const borrowPercentError =
    positionAction === "borrow" ? getPercentError(borrowPercent) : null;
  const collateralAmountError =
    baseCollateralAmountError ??
    (positionAction === "borrow" &&
    parsedDebtAmount &&
    minimumRequiredDeposit != null &&
    (parsedCollateralAmount?.toBase() ?? 0n) < minimumRequiredDeposit
      ? `Deposit at least ${amountFromBase(
          minimumRequiredDeposit,
          selectedCollateralToken
        )} to support this borrow`
      : null);
  const debtAmountError =
    positionAction === "repay" &&
    (parsedCollateralAmount?.toBase() ?? 0n) > 0n &&
    parsedDebtAmount?.toBase() === 0n
      ? null
      : baseDebtAmountError;

  // Position display values
  const currentStatus = getVesuHealthStatus(health, position);
  const currentCollateralAmount = amountFromBase(
    position?.collateralAmount,
    selectedCollateralToken
  );
  const currentDebtAmount = amountFromBase(
    position?.debtAmount,
    selectedDebtAsset?.token ?? null
  );
  const exactDebtAmountLabel =
    position?.debtAmount != null && selectedDebtAsset
      ? Amount.fromRaw(
          position.debtAmount,
          selectedDebtAsset.token
        ).toFormatted()
      : null;
  const closeRepayAmount = useMemo(() => {
    if (!selectedDebtAsset) {
      return null;
    }

    return getVesuCloseRepayAmount({
      debtAmount: position?.debtAmount,
      debtToken: selectedDebtAsset.token,
    });
  }, [position?.debtAmount, selectedDebtAsset]);
  const repayMaxInputValue = useMemo(() => {
    if (positionAction !== "repay" || !selectedDebtAsset) {
      return undefined;
    }

    const walletBalanceBase = debtWalletBalance?.toBase();
    const targetRepayBase = closeRepayAmount ?? position?.debtAmount ?? null;
    if (targetRepayBase == null) {
      return debtWalletBalance ? debtWalletBalance.toUnit() : undefined;
    }

    const maxRepayBase =
      walletBalanceBase == null || walletBalanceBase > targetRepayBase
        ? targetRepayBase
        : walletBalanceBase;
    return maxRepayBase > 0n
      ? Amount.fromRaw(maxRepayBase, selectedDebtAsset.token).toUnit()
      : undefined;
  }, [
    closeRepayAmount,
    debtWalletBalance,
    position?.debtAmount,
    positionAction,
    selectedDebtAsset,
  ]);

  const debtDropdownOptions = useMemo<DropdownOption[]>(
    () =>
      debtOptions.map((o) => ({
        key: o.key,
        label: o.token.symbol,
        description: `${getVesuPoolLabel(o.poolAddress)} · Borrowable`,
      })),
    [debtOptions]
  );

  const draftMaxBorrowLabel =
    draftMaxBorrowAmount != null && selectedDebtAsset
      ? Amount.fromRaw(
          draftMaxBorrowAmount,
          selectedDebtAsset.token
        ).toFormatted(true)
      : null;
  const minimumRequiredDepositLabel =
    minimumRequiredDeposit != null &&
    minimumRequiredDeposit > 0n &&
    selectedCollateralToken
      ? amountFromBase(minimumRequiredDeposit, selectedCollateralToken)
      : null;

  const handleDebtAmountChange = useCallback(
    (value: string) => {
      setBorrowDriver("debt");
      setDebtAmount(value);

      if (
        positionAction !== "borrow" ||
        !selectedDebtAsset ||
        draftMaxBorrowAmount == null ||
        draftMaxBorrowAmount <= 0n
      ) {
        setBorrowPercent("");
        return;
      }

      const parsed = parseAmountInput(value, selectedDebtAsset.token);
      if (!parsed) {
        setBorrowPercent("");
        return;
      }

      const ratio =
        parsed.toBase() >= draftMaxBorrowAmount
          ? PERCENT_SCALE
          : (parsed.toBase() * PERCENT_SCALE) / draftMaxBorrowAmount;
      setBorrowPercent(formatPercentInput(ratio));
    },
    [draftMaxBorrowAmount, positionAction, selectedDebtAsset]
  );

  const handleCollateralAmountChange = useCallback((value: string) => {
    setCollateralAmount(value);
  }, []);

  const handleBorrowPercentChange = useCallback(
    (value: string) => {
      setBorrowDriver("percent");
      setBorrowPercent(value);

      const percent = parsePercentInput(value);
      if (
        percent == null ||
        !selectedDebtAsset ||
        draftMaxBorrowAmount == null ||
        draftMaxBorrowAmount <= 0n
      ) {
        return;
      }

      setDebtAmount(
        Amount.fromRaw(
          (draftMaxBorrowAmount * percent) / PERCENT_SCALE,
          selectedDebtAsset.token
        ).toUnit()
      );
    },
    [draftMaxBorrowAmount, selectedDebtAsset]
  );

  useEffect(() => {
    if (
      positionAction !== "borrow" ||
      borrowDriver !== "percent" ||
      !selectedDebtAsset ||
      draftMaxBorrowAmount == null ||
      draftMaxBorrowAmount <= 0n
    ) {
      return;
    }

    const percent = parsePercentInput(borrowPercent);
    if (percent == null) {
      return;
    }

    const nextDebtAmount = Amount.fromRaw(
      (draftMaxBorrowAmount * percent) / PERCENT_SCALE,
      selectedDebtAsset.token
    ).toUnit();
    setDebtAmount((current) =>
      current === nextDebtAmount ? current : nextDebtAmount
    );
  }, [
    borrowDriver,
    borrowPercent,
    draftMaxBorrowAmount,
    positionAction,
    selectedDebtAsset,
  ]);

  useEffect(() => {
    if (
      positionAction !== "borrow" ||
      borrowDriver === "percent" ||
      !selectedDebtAsset ||
      draftMaxBorrowAmount == null ||
      draftMaxBorrowAmount <= 0n
    ) {
      if (positionAction === "borrow" && borrowDriver !== "percent") {
        setBorrowPercent((current) => (current ? "" : current));
      }
      return;
    }

    const parsed = parseAmountInput(debtAmount, selectedDebtAsset.token);
    if (!parsed) {
      setBorrowPercent((current) => (current ? "" : current));
      return;
    }

    const ratio =
      parsed.toBase() >= draftMaxBorrowAmount
        ? PERCENT_SCALE
        : (parsed.toBase() * PERCENT_SCALE) / draftMaxBorrowAmount;
    const nextPercent = formatPercentInput(ratio);
    setBorrowPercent((current) =>
      current === nextPercent ? current : nextPercent
    );
  }, [
    borrowDriver,
    debtAmount,
    draftMaxBorrowAmount,
    positionAction,
    selectedDebtAsset,
  ]);

  // Track a submitted transaction
  const trackTransaction = useCallback(
    async (params: {
      tx: Tx;
      pendingTitle: string;
      pendingSubtitle: string;
      successTitle: string;
      successSubtitle: string;
    }) => {
      showTransactionToast(
        {
          txHash: params.tx.hash,
          title: params.pendingTitle,
          subtitle: params.pendingSubtitle,
          explorerUrl: getExplorerUrl(params.tx.hash, chainId),
        },
        true
      );
      addLog("Waiting for Vesu confirmation...");
      await params.tx.wait();
      updateTransactionToast({
        txHash: params.tx.hash,
        title: params.successTitle,
        subtitle: params.successSubtitle,
        explorerUrl: getExplorerUrl(params.tx.hash, chainId),
      });
    },
    [addLog, chainId]
  );

  const handleCopyAddress = useCallback(async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    addLog("Wallet address copied");
    showCopiedToast();
  }, [addLog, wallet]);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const refreshPosition = useCallback(async () => {
    if (
      !wallet ||
      !isVesuSupported ||
      !isMarketSheetOpen ||
      !selectedDebtAsset ||
      !selectedCollateralToken
    ) {
      setPosition(null);
      setHealth(null);
      setMaxBorrowAmount(null);
      setPositionError(null);
      return;
    }

    const request = {
      provider: VESU_PROVIDER_ID,
      ...(selectedVaultAsset?.poolAddress
        ? { poolAddress: selectedVaultAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
      ...(useExistingSupply ? { useEarnPosition: true } : {}),
    };

    setIsRefreshingPosition(true);
    setPositionError(null);
    try {
      const [nextPosition, nextHealth, nextMaxBorrow] = await Promise.all([
        wallet.lending().getPosition(request),
        wallet.lending().getHealth(request),
        wallet
          .lending()
          .getMaxBorrowAmount(request)
          .catch(() => null),
      ]);
      setPosition(nextPosition);
      setHealth(nextHealth);
      setMaxBorrowAmount(nextMaxBorrow);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPositionError(message);
      addLog(`Failed to load Vesu position: ${message}`);
    } finally {
      setIsRefreshingPosition(false);
    }
  }, [
    addLog,
    isMarketSheetOpen,
    isVesuSupported,
    selectedCollateralToken,
    selectedDebtAsset,
    selectedVaultAsset,
    useExistingSupply,
    wallet,
  ]);

  const loadMarkets = useCallback(async () => {
    if (!wallet || !isVesuSupported) {
      setMarkets([]);
      setMarketError(null);
      return;
    }

    setIsLoadingMarkets(true);
    setMarketError(null);
    try {
      const nextMarkets = await wallet
        .lending()
        .getMarkets({ provider: VESU_PROVIDER_ID });
      setMarkets(nextMarkets);
      addLog(
        nextMarkets.length
          ? `Loaded ${nextMarkets.length} Vesu market(s)`
          : "Vesu market discovery returned no metadata; using fallback assets"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMarketError(message);
      setMarkets([]);
      addLog(`Vesu market discovery failed: ${message}`);
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [addLog, isVesuSupported, wallet]);

  const loadUserPositions = useCallback(async () => {
    if (!wallet || !isVesuSupported) {
      setUserPositions([]);
      return;
    }
    try {
      const positions = await wallet
        .lending()
        .getPositions({ provider: VESU_PROVIDER_ID });
      setUserPositions(positions);
      if (positions.length > 0) {
        addLog(`Loaded ${positions.length} Vesu position(s)`);
      }
    } catch (e) {
      addLog(
        `Vesu positions fetch failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [addLog, isVesuSupported, wallet]);

  const handleRefresh = useCallback(async () => {
    if (!wallet) return;

    await Promise.all([
      fetchBalances(wallet, chainId),
      loadMarkets(),
      refreshPosition(),
      loadUserPositions(),
    ]);
  }, [
    chainId,
    fetchBalances,
    loadMarkets,
    loadUserPositions,
    refreshPosition,
    wallet,
  ]);

  // Effects
  useEffect(() => {
    if (wallet) void fetchBalances(wallet, chainId);
  }, [chainId, fetchBalances, wallet]);
  useEffect(() => {
    if (wallet) void loadMarkets();
  }, [loadMarkets, wallet]);
  useEffect(() => {
    if (wallet) void loadUserPositions();
  }, [loadUserPositions, wallet]);
  useEffect(() => {
    if (wallet) void refreshPosition();
  }, [refreshPosition, wallet]);
  useEffect(() => {
    handleCloseMarket();
  }, [chainId, handleCloseMarket]);
  useEffect(() => {
    if (marketSheetTab === "borrow" && debtOptions.length === 0)
      setMarketSheetTab("supply");
  }, [debtOptions.length, marketSheetTab]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleVaultSubmit = useCallback(async () => {
    if (!wallet || !selectedVaultAsset) return;
    const options = getExecuteOptions(useSponsored, canUseSponsored);
    const requestBase = {
      provider: VESU_PROVIDER_ID,
      ...(selectedVaultAsset.poolAddress
        ? { poolAddress: selectedVaultAsset.poolAddress }
        : {}),
      token: selectedVaultAsset.token,
    };
    const amount = parseAmountInput(vaultAmount, selectedVaultAsset.token);
    if (!amount) {
      Alert.alert("Vesu", "Enter a valid amount first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const tx =
        vaultAction === "deposit"
          ? await wallet.lending().deposit({ ...requestBase, amount }, options)
          : await wallet
              .lending()
              .withdraw({ ...requestBase, amount }, options);

      addLog(`Vesu ${vaultAction} submitted: ${tx.hash.slice(0, 10)}...`);
      await trackTransaction({
        tx,
        pendingTitle:
          vaultAction === "deposit"
            ? "Depositing into Vesu"
            : "Withdrawing from Vesu",
        pendingSubtitle: `${vaultAction === "deposit" ? "Depositing" : "Withdrawing"} ${amount.toUnit()} ${selectedVaultAsset.token.symbol}`,
        successTitle:
          vaultAction === "deposit"
            ? "Vesu Deposit Complete"
            : "Vesu Withdraw Complete",
        successSubtitle: `${vaultAction === "deposit" ? "Deposited" : "Withdrew"} ${amount.toUnit()} ${selectedVaultAsset.token.symbol}`,
      });
      setVaultAmount("");
      await Promise.all([
        fetchBalances(wallet, chainId),
        loadMarkets(),
        refreshPosition(),
        loadUserPositions(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Vesu ${vaultAction} failed: ${message}`);
      Alert.alert("Vesu Transaction Failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canUseSponsored,
    chainId,
    fetchBalances,
    loadMarkets,
    loadUserPositions,
    refreshPosition,
    selectedVaultAsset,
    trackTransaction,
    useSponsored,
    vaultAction,
    vaultAmount,
    wallet,
    addLog,
  ]);

  const handleWithdrawMax = useCallback(async () => {
    if (!wallet || !selectedVaultAsset) return;
    setIsSubmitting(true);
    try {
      const tx = await wallet.lending().withdrawMax(
        {
          provider: VESU_PROVIDER_ID,
          ...(selectedVaultAsset.poolAddress
            ? { poolAddress: selectedVaultAsset.poolAddress }
            : {}),
          token: selectedVaultAsset.token,
        },
        getExecuteOptions(useSponsored, canUseSponsored)
      );
      addLog(`Vesu withdraw max submitted: ${tx.hash.slice(0, 10)}...`);
      await trackTransaction({
        tx,
        pendingTitle: "Withdrawing Max from Vesu",
        pendingSubtitle: `Redeeming all ${selectedVaultAsset.token.symbol} vTokens`,
        successTitle: "Vesu Withdraw Max Complete",
        successSubtitle: `Redeemed all available ${selectedVaultAsset.token.symbol}`,
      });
      await Promise.all([
        fetchBalances(wallet, chainId),
        loadMarkets(),
        refreshPosition(),
        loadUserPositions(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Vesu withdraw max failed: ${message}`);
      Alert.alert("Vesu Transaction Failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    addLog,
    canUseSponsored,
    chainId,
    fetchBalances,
    loadMarkets,
    loadUserPositions,
    refreshPosition,
    selectedVaultAsset,
    trackTransaction,
    useSponsored,
    wallet,
  ]);

  const handlePositionSubmit = useCallback(async () => {
    if (
      !wallet ||
      !selectedDebtAsset ||
      !selectedCollateralToken ||
      !isVesuSupported
    )
      return;

    const commonRequest = {
      provider: VESU_PROVIDER_ID,
      ...(selectedVaultAsset?.poolAddress
        ? { poolAddress: selectedVaultAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
    };
    const parsedDebt = parseAmountInput(debtAmount, selectedDebtAsset.token);
    const parsedCollateral = parseAmountInput(
      collateralAmount,
      selectedCollateralToken
    );
    const requestedDebtAmount =
      positionAction === "repay"
        ? getVesuRepaySubmissionAmount({
            debtToken: selectedDebtAsset.token,
            debtAmount: parsedDebt,
            collateralAmount: parsedCollateral,
            currentDebtAmount: position?.debtAmount,
            walletDebtBalance: debtWalletBalance?.toBase(),
          })
        : parsedDebt;
    if (!requestedDebtAmount) {
      Alert.alert(
        "Vesu",
        positionAction === "repay"
          ? "Enter a debt amount or collateral to withdraw first."
          : "Enter a valid debt amount first."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const options = getExecuteOptions(useSponsored, canUseSponsored);
      const isCollateralOnlyRepay =
        positionAction === "repay" && requestedDebtAmount.toBase() === 0n;
      const tx =
        positionAction === "borrow"
          ? await wallet.lending().borrow(
              {
                ...commonRequest,
                amount: requestedDebtAmount,
                ...(parsedCollateral
                  ? { collateralAmount: parsedCollateral }
                  : {}),
                ...(useExistingSupply ? { useEarnPosition: true } : {}),
              },
              options
            )
          : await wallet.lending().repay(
              {
                ...commonRequest,
                amount: requestedDebtAmount,
                ...(parsedCollateral
                  ? {
                      collateralAmount: parsedCollateral,
                      withdrawCollateral: true,
                    }
                  : {}),
              },
              options
            );

      addLog(`Vesu ${positionAction} submitted: ${tx.hash.slice(0, 10)}...`);
      await trackTransaction({
        tx,
        pendingTitle:
          positionAction === "borrow"
            ? "Opening Vesu Borrow"
            : isCollateralOnlyRepay
              ? "Withdrawing Vesu Collateral"
              : "Repaying Vesu Debt",
        pendingSubtitle:
          positionAction === "borrow"
            ? `Borrowing ${requestedDebtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`
            : isCollateralOnlyRepay
              ? `Withdrawing ${parsedCollateral?.toUnit() ?? "0"} ${selectedCollateralToken.symbol} collateral`
              : `Repaying ${requestedDebtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`,
        successTitle:
          positionAction === "borrow"
            ? "Vesu Borrow Complete"
            : isCollateralOnlyRepay
              ? "Vesu Collateral Withdraw Complete"
              : "Vesu Repay Complete",
        successSubtitle:
          positionAction === "borrow"
            ? `Borrowed ${requestedDebtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`
            : isCollateralOnlyRepay
              ? `Withdrew ${parsedCollateral?.toUnit() ?? "0"} ${selectedCollateralToken.symbol} collateral`
              : `Repaid ${requestedDebtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`,
      });
      setDebtAmount("");
      setCollateralAmount("");
      setBorrowPercent("");
      setBorrowDriver(null);

      await Promise.all([
        fetchBalances(wallet, chainId),
        loadMarkets(),
        refreshPosition(),
        loadUserPositions(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Vesu ${positionAction} failed: ${message}`);
      Alert.alert("Vesu Transaction Failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    addLog,
    canUseSponsored,
    chainId,
    collateralAmount,
    debtAmount,
    debtWalletBalance,
    fetchBalances,
    isVesuSupported,
    loadMarkets,
    loadUserPositions,
    position?.debtAmount,
    positionAction,
    refreshPosition,
    selectedCollateralToken,
    selectedDebtAsset,
    selectedVaultAsset,
    trackTransaction,
    useExistingSupply,
    useSponsored,
    wallet,
  ]);

  if (!wallet) return null;

  // -----------------------------------------------------------------------
  // Validation flags
  // -----------------------------------------------------------------------
  const borrowNeedsCollateral =
    marketSheetTab === "borrow" &&
    positionAction === "borrow" &&
    !!selectedDebtAsset &&
    !isRefreshingPosition &&
    !canBorrowAgainstCurrentCollateral &&
    (parsedCollateralAmount?.toBase() ?? 0n) <= 0n;
  const canSubmitVault =
    !!selectedVaultAsset &&
    !!vaultAmount.trim() &&
    !vaultAmountError &&
    !isSubmitting;
  const hasRepayInput =
    positionAction === "repay"
      ? !!debtAmount.trim() || !!collateralAmount.trim()
      : !!debtAmount.trim();
  const canSubmitPosition =
    !!selectedDebtAsset &&
    !!selectedCollateralToken &&
    !isSubmitting &&
    !isRefreshingPosition &&
    hasRepayInput &&
    !debtAmountError &&
    !borrowPercentError &&
    !collateralAmountError &&
    !borrowNeedsCollateral;
  const showBorrowPercentField =
    positionAction === "borrow" &&
    !!selectedDebtAsset &&
    draftMaxBorrowAmount != null &&
    draftMaxBorrowAmount > 0n;
  const borrowSubmitLabel =
    positionAction === "borrow"
      ? "Submit Borrow"
      : !debtAmount.trim() && !!collateralAmount.trim()
        ? "Submit Collateral Withdraw"
        : "Submit Repay";

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              isLoadingBalances || isLoadingMarkets || isRefreshingPosition
            }
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title">Vesu</ThemedText>
          <View style={styles.headerRight}>
            <View
              style={[styles.networkPill, { backgroundColor: borderColor }]}
            >
              <ThemedText
                style={[styles.networkPillText, { color: primaryColor }]}
              >
                {networkName}
              </ThemedText>
            </View>
            <TouchableOpacity onPress={handleDisconnect} hitSlop={8}>
              <ThemedText type="link" style={{ fontSize: 13 }}>
                Disconnect
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
        <ThemedText style={[styles.smallText, { color: textSecondary }]}>
          Lending and borrowing by market
        </ThemedText>

        {/* Main card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.addressRow}>
            <ThemedText style={[styles.label, { color: textSecondary }]}>
              Wallet
            </ThemedText>
            <TouchableOpacity
              style={[styles.addressButton, { backgroundColor: borderColor }]}
              onPress={handleCopyAddress}
              activeOpacity={0.88}
            >
              <ThemedText style={{ fontSize: 12, fontWeight: "700" }}>
                {cropAddress(wallet.address)}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {!isVesuSupported && (
            <ThemedText style={[styles.smallText, { color: textSecondary }]}>
              Vesu is configured for Starknet Mainnet and Sepolia only.
            </ThemedText>
          )}

          {isVesuSupported && (
            <>
              <View style={styles.infoRow}>
                <ThemedText style={[styles.label, { color: textSecondary }]}>
                  Markets
                </ThemedText>
                {isLoadingMarkets ? (
                  <ActivityIndicator size="small" color={primaryColor} />
                ) : (
                  <ThemedText
                    style={[styles.smallText, { color: textSecondary }]}
                  >
                    {marketCards.length
                      ? `${marketCards.length} cards`
                      : chainId.isSepolia()
                        ? "Using fallback Sepolia cards"
                        : "Using fallback market cards"}
                  </ThemedText>
                )}
              </View>

              {marketError && (
                <ThemedText style={styles.errorText}>{marketError}</ThemedText>
              )}

              {marketCards.length > 0 ? (
                <View style={styles.marketCardGrid}>
                  {marketCards.map((card) => (
                    <MarketCardView
                      key={card.key}
                      card={card}
                      isSelected={
                        isMarketSheetOpen &&
                        selectedMarketCard?.key === card.key
                      }
                      onPress={() => handleOpenMarket(card.option)}
                      width={columnWidth}
                      userPosition={positionByCardKey.get(card.key)}
                    />
                  ))}
                </View>
              ) : (
                <ThemedText
                  style={[styles.smallText, { color: textSecondary }]}
                >
                  No Vesu markets are currently available for this network.
                </ThemedText>
              )}

              <ThemedText style={[styles.smallText, { color: textSecondary }]}>
                Tap a market card to open its supply and borrow flow for that
                pool.
              </ThemedText>

              {/* Sponsored toggle */}
              <View style={styles.sponsoredRow}>
                <ThemedText style={[styles.label, { color: textSecondary }]}>
                  Sponsored Mode
                </ThemedText>
                <View
                  style={[
                    styles.sponsoredSwitch,
                    !canUseSponsored && { opacity: 0.5 },
                  ]}
                >
                  {(["Off", "On"] as const).map((label) => {
                    const isOn = label === "On";
                    const isActive = useSponsored === isOn;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[
                          styles.sponsoredSegment,
                          isActive && styles.sponsoredSegmentSelected,
                        ]}
                        onPress={() => setUseSponsored(isOn)}
                        disabled={!canUseSponsored}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.sponsoredText,
                            isActive && { color: "#fff" },
                          ]}
                        >
                          {label}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {!canUseSponsored && (
                <ThemedText
                  style={[styles.smallText, { color: textSecondary }]}
                >
                  Paymaster not configured
                </ThemedText>
              )}
            </>
          )}
        </View>

        <ThemedText style={[styles.footerHint, { color: textSecondary }]}>
          Pull down to refresh balances and market data.
        </ThemedText>
      </ScrollView>

      {/* Market sheet modal */}
      <Modal
        visible={isMarketSheetOpen && !!selectedMarketCard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseMarket}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
          edges={["top"]}
        >
          {selectedMarketCard && (
            <>
              {/* Modal header */}
              <View
                style={[styles.modalHeader, { borderBottomColor: borderColor }]}
              >
                <View style={styles.tokenRow}>
                  <TokenAvatar
                    token={selectedMarketCard.option.token}
                    size={42}
                  />
                  <View style={{ gap: 2 }}>
                    <ThemedText style={{ fontSize: 20, fontWeight: "800" }}>
                      {selectedMarketCard.option.token.symbol}
                    </ThemedText>
                    <View style={styles.poolRow}>
                      <PoolAvatar
                        poolLabel={selectedMarketCard.poolLabel}
                        size={20}
                      />
                      <ThemedText
                        style={[{ fontSize: 13 }, { color: textSecondary }]}
                      >
                        {selectedMarketCard.poolLabel}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.closeButton, { backgroundColor: borderColor }]}
                  onPress={handleCloseMarket}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[styles.closeButtonText, { color: primaryColor }]}
                  >
                    Close
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  padding: 20,
                  paddingBottom: 48,
                  gap: 14,
                }}
              >
                {/* Overview card */}
                <View
                  style={[
                    styles.card,
                    { backgroundColor, borderColor, gap: 16 },
                  ]}
                >
                  <MetricsGrid card={selectedMarketCard} />
                  <View style={{ gap: 8 }}>
                    <ThemedText
                      style={[styles.smallText, { color: textSecondary }]}
                    >
                      Collateral
                    </ThemedText>
                    {selectedMarketCard.option.canBorrow ? (
                      <View style={styles.collateralRow}>
                        {selectedMarketCard.collateralTokens.length > 0 ? (
                          selectedMarketCard.collateralTokens.map(
                            (token, i) => (
                              <View
                                key={`${selectedMarketCard.key}:${token.address}`}
                                style={{
                                  marginLeft: i === 0 ? 0 : -8,
                                  borderRadius: 999,
                                }}
                              >
                                <TokenAvatar token={token} size={26} />
                              </View>
                            )
                          )
                        ) : (
                          <ThemedText
                            style={[styles.smallText, { color: textSecondary }]}
                          >
                            Same-pool collateral metadata unavailable
                          </ThemedText>
                        )}
                      </View>
                    ) : (
                      <ThemedText
                        style={[styles.smallText, { color: textSecondary }]}
                      >
                        Borrowing of {selectedMarketCard.option.token.symbol} is
                        not enabled on this market.
                      </ThemedText>
                    )}
                  </View>
                </View>

                {/* My Position card (from Vesu indexer) */}
                {selectedMarketCard &&
                  (() => {
                    const earnPos = getVesuUserPositionForMarket({
                      userPositions,
                      token: selectedMarketCard.option.token,
                      poolAddress: selectedMarketCard.option.poolAddress,
                      type: "earn",
                    });
                    const borrowPos = getVesuUserPositionForMarket({
                      userPositions,
                      token: selectedMarketCard.option.token,
                      poolAddress: selectedMarketCard.option.poolAddress,
                      type: "borrow",
                    });
                    if (!earnPos && !borrowPos) return null;
                    return (
                      <View
                        style={[
                          styles.card,
                          {
                            backgroundColor: "#f0fdf4",
                            borderColor: "#bbf7d0",
                            gap: 10,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[styles.cardTitle, { color: "#15803d" }]}
                        >
                          My Position
                        </ThemedText>
                        {earnPos && (
                          <View style={styles.positionDetailRow}>
                            <ThemedText style={styles.positionDetailLabel}>
                              Deposited
                            </ThemedText>
                            <ThemedText style={styles.positionDetailValue}>
                              {Amount.fromRaw(
                                earnPos.collateral.amount,
                                earnPos.collateral.token
                              ).toFormatted(true)}{" "}
                              {earnPos.collateral.token.symbol}
                            </ThemedText>
                          </View>
                        )}
                        {borrowPos && (
                          <>
                            <View style={styles.positionDetailRow}>
                              <ThemedText style={styles.positionDetailLabel}>
                                Collateral
                              </ThemedText>
                              <ThemedText style={styles.positionDetailValue}>
                                {Amount.fromRaw(
                                  borrowPos.collateral.amount,
                                  borrowPos.collateral.token
                                ).toFormatted(true)}{" "}
                                {borrowPos.collateral.token.symbol}
                              </ThemedText>
                            </View>
                            {borrowPos.debt && (
                              <View style={styles.positionDetailRow}>
                                <ThemedText style={styles.positionDetailLabel}>
                                  Debt
                                </ThemedText>
                                <ThemedText style={styles.positionDetailValue}>
                                  {Amount.fromRaw(
                                    borrowPos.debt.amount,
                                    borrowPos.debt.token
                                  ).toFormatted(true)}{" "}
                                  {borrowPos.debt.token.symbol}
                                </ThemedText>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    );
                  })()}

                {/* Supply / Borrow tab toggle */}
                <View style={[styles.tabRow, { backgroundColor, borderColor }]}>
                  {(["supply", "borrow"] as const).map((tab) => {
                    const isActive = marketSheetTab === tab;
                    const isDisabled =
                      tab === "borrow" && debtOptions.length === 0;
                    return (
                      <TouchableOpacity
                        key={tab}
                        style={[
                          styles.tabButton,
                          isActive && styles.tabButtonActive,
                          isDisabled && { opacity: 0.55 },
                        ]}
                        onPress={() => {
                          if (!isDisabled) {
                            setMarketSheetTab(tab);
                            if (tab === "borrow") setPositionAction("borrow");
                          }
                        }}
                        disabled={isDisabled}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.tabText,
                            { color: isActive ? "#fff" : primaryColor },
                            isDisabled && { color: textSecondary },
                          ]}
                        >
                          {tab === "supply" ? "Supply" : "Borrow"}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Supply tab content */}
                {marketSheetTab === "supply" && (
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: cardBg, borderColor },
                    ]}
                  >
                    <ThemedText style={styles.cardTitle}>
                      {vaultAction === "deposit"
                        ? `Deposit ${selectedMarketCard.option.token.symbol}`
                        : `Withdraw ${selectedMarketCard.option.token.symbol}`}
                    </ThemedText>
                    <ActionPills
                      actions={VAULT_ACTIONS}
                      labels={{ deposit: "Deposit", withdraw: "Withdraw" }}
                      selected={vaultAction}
                      onSelect={setVaultAction}
                    />
                    <AmountField
                      label="Amount"
                      hint={
                        vaultAction === "deposit"
                          ? `Wallet ${vaultBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}${depositedBalance ? ` · Deposited ${depositedBalance.toFormatted(true)}` : ""}`
                          : `Deposited ${depositedBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL} · Use Withdraw Max to redeem all`
                      }
                      value={vaultAmount}
                      error={vaultAmountError}
                      onChangeText={setVaultAmount}
                      maxValue={
                        vaultAction === "deposit" && vaultBalance
                          ? vaultBalance.toUnit()
                          : undefined
                      }
                    />
                    <SubmitButton
                      label={
                        vaultAction === "deposit"
                          ? "Submit Deposit"
                          : "Submit Withdraw"
                      }
                      enabled={canSubmitVault}
                      loading={isSubmitting}
                      onPress={() => void handleVaultSubmit()}
                    />
                    <SecondaryButton
                      label="Withdraw Max"
                      enabled={!isSubmitting && !!selectedVaultAsset}
                      onPress={() => void handleWithdrawMax()}
                    />
                  </View>
                )}

                {/* Borrow tab content */}
                {marketSheetTab === "borrow" && debtOptions.length > 0 && (
                  <>
                    <View
                      style={[
                        styles.card,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <PositionHealthCard
                        currentStatus={currentStatus}
                        health={health}
                        collateralAmount={currentCollateralAmount}
                        debtAmount={currentDebtAmount}
                        isRefreshing={isRefreshingPosition}
                        positionError={positionError}
                        onRefresh={() => void refreshPosition()}
                      />
                    </View>

                    {borrowNeedsCollateral && (
                      <View
                        style={[
                          styles.noticeCard,
                          { backgroundColor, borderColor },
                        ]}
                      >
                        <ThemedText style={{ fontSize: 14, fontWeight: "700" }}>
                          Add collateral to start borrowing
                        </ThemedText>
                        <ThemedText
                          style={[
                            { fontSize: 13, lineHeight: 18 },
                            { color: textSecondary },
                          ]}
                        >
                          Enter an amount to deposit below, or turn on existing
                          supply if you already have matching collateral in
                          Vesu.
                        </ThemedText>
                      </View>
                    )}

                    <View
                      style={[
                        styles.card,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <ThemedText style={styles.cardTitle}>
                        {positionAction === "borrow"
                          ? `Borrow against ${selectedMarketCard.option.token.symbol}`
                          : "Repay Debt"}
                      </ThemedText>

                      <DropdownField
                        label={
                          positionAction === "borrow"
                            ? "Token to Borrow"
                            : "Token to Repay"
                        }
                        placeholder="No borrowable assets"
                        valueLabel={selectedDebtAsset?.token.symbol ?? null}
                        valueDescription={
                          selectedDebtAsset
                            ? `${getVesuPoolLabel(selectedDebtAsset.poolAddress)} · Borrowable`
                            : undefined
                        }
                        options={debtDropdownOptions}
                        onSelect={setSelectedBorrowAssetKey}
                      />

                      <ActionPills
                        actions={POSITION_ACTIONS}
                        labels={{ borrow: "Borrow", repay: "Repay" }}
                        selected={positionAction}
                        onSelect={setPositionAction}
                      />

                      {positionAction === "borrow" && (
                        <View
                          style={[
                            styles.toggleRow,
                            { backgroundColor: `${primaryColor}10` },
                          ]}
                        >
                          <View style={styles.toggleLabel}>
                            <Ionicons
                              name="layers-outline"
                              size={18}
                              color={primaryColor}
                            />
                            <ThemedText
                              style={[
                                styles.toggleLabelText,
                                { color: primaryColor },
                              ]}
                            >
                              Use existing supply if available
                            </ThemedText>
                          </View>
                          <View style={styles.toggleButtons}>
                            <TouchableOpacity
                              style={[
                                styles.toggleButton,
                                {
                                  borderColor,
                                  backgroundColor: useExistingSupply
                                    ? primaryColor
                                    : "transparent",
                                },
                              ]}
                              onPress={() => setUseExistingSupply(true)}
                            >
                              <ThemedText
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: useExistingSupply
                                    ? "#fff"
                                    : textSecondary,
                                }}
                              >
                                YES
                              </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.toggleButton,
                                {
                                  borderColor,
                                  backgroundColor: !useExistingSupply
                                    ? primaryColor
                                    : "transparent",
                                },
                              ]}
                              onPress={() => setUseExistingSupply(false)}
                            >
                              <ThemedText
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: !useExistingSupply
                                    ? "#fff"
                                    : textSecondary,
                                }}
                              >
                                NO
                              </ThemedText>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      <AmountField
                        label={
                          positionAction === "borrow"
                            ? "Amount to Borrow"
                            : "Amount to Repay (optional)"
                        }
                        hint={
                          positionAction === "borrow"
                            ? `Wallet ${debtWalletBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}${draftMaxBorrowLabel ? ` · Max ${draftMaxBorrowLabel}` : ""}`
                            : `Debt ${exactDebtAmountLabel ?? EMPTY_STATE_LABEL} · Wallet ${debtWalletBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}`
                        }
                        value={debtAmount}
                        error={debtAmountError}
                        onChangeText={handleDebtAmountChange}
                        maxValue={
                          positionAction === "repay"
                            ? repayMaxInputValue
                            : draftMaxBorrowAmount != null &&
                                draftMaxBorrowAmount > 0n &&
                                selectedDebtAsset
                              ? Amount.fromRaw(
                                  draftMaxBorrowAmount,
                                  selectedDebtAsset.token
                                ).toUnit()
                              : undefined
                        }
                      />

                      {positionAction === "repay" && (
                        <ThemedText
                          style={[styles.smallText, { color: textSecondary }]}
                        >
                          Leave blank to withdraw collateral only.
                        </ThemedText>
                      )}

                      {positionAction === "repay" &&
                        closeRepayAmount != null &&
                        (debtWalletBalance?.toBase() ?? 0n) >=
                          closeRepayAmount && (
                          <ThemedText
                            style={[styles.smallText, { color: textSecondary }]}
                          >
                            MAX includes a small buffer to clear residual debt.
                          </ThemedText>
                        )}

                      {positionAction === "borrow" &&
                        showBorrowPercentField && (
                          <PercentField
                            label="Borrow % of Max"
                            hint={
                              draftMaxBorrowLabel
                                ? `100 = ${draftMaxBorrowLabel}`
                                : "0 to 100"
                            }
                            value={borrowPercent}
                            error={borrowPercentError}
                            onChangeText={handleBorrowPercentChange}
                          />
                        )}

                      <AmountField
                        label={
                          positionAction === "borrow"
                            ? "Amount to Deposit"
                            : "Collateral to Withdraw"
                        }
                        hint={
                          positionAction === "borrow"
                            ? `Wallet ${vaultBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}${minimumRequiredDepositLabel ? ` · Need ${minimumRequiredDepositLabel}` : depositedBalance ? ` · Deposited ${depositedBalance.toFormatted(true)}` : ""}`
                            : `Position ${amountFromBase(position?.collateralAmount, selectedCollateralToken)}`
                        }
                        value={collateralAmount}
                        error={collateralAmountError}
                        onChangeText={handleCollateralAmountChange}
                        maxValue={
                          positionAction === "borrow"
                            ? vaultBalance?.toUnit()
                            : selectedCollateralToken &&
                                position?.collateralAmount != null
                              ? Amount.fromRaw(
                                  position.collateralAmount,
                                  selectedCollateralToken
                                ).toUnit()
                              : undefined
                        }
                      />

                      {positionAction === "borrow" && draftMaxBorrowLabel && (
                        <ThemedText
                          style={[styles.smallText, { color: textSecondary }]}
                        >
                          Current borrow limit with this deposit:{" "}
                          {draftMaxBorrowLabel}
                        </ThemedText>
                      )}

                      <SubmitButton
                        label={borrowSubmitLabel}
                        enabled={canSubmitPosition}
                        loading={isSubmitting}
                        onPress={() => void handlePositionSubmit()}
                      />
                    </View>
                  </>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>

      <LogsFAB />
    </SafeAreaView>
  );
}
