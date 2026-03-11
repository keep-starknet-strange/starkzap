import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { usePrivy } from "@privy-io/expo";

import {
  Amount,
  type ChainId,
  type ExecuteOptions,
  type LendingHealth,
  type LendingMarket,
  type LendingPosition,
  type Token,
  type Tx,
} from "@starkzap/native";
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
import {
  buildVesuAssetOptions,
  buildVesuMarketCards,
  formatVesuLtv,
  formatVesuUsdValue,
  getAvailableVesuCollateralAssets,
  getDefaultVesuCollateralAsset,
  getVesuHealthStatus,
  getVesuPoolLabel,
  getVesuPoolVisual,
  hasVesuExposure,
  VESU_PROVIDER_ID,
  type VesuApiMarketItem,
  type VesuAssetOption,
} from "@/vesu";

type VaultAction = "deposit" | "withdraw";
type PositionAction = "borrow" | "repay";
type MarketSheetTab = "supply" | "borrow";

const FEE_MODE_SPONSORED = "sponsored" as const;
const FEE_MODE_USER_PAYS = "user_pays" as const;
const EMPTY_STATE_LABEL = "—";
const SUPPORTED_VESU_CHAINS = new Set(["SN_MAIN", "SN_SEPOLIA"]);
const VESU_MARKETS_API_URL = "https://api.vesu.xyz/markets";

interface DropdownOption {
  key: string;
  label: string;
  description?: string;
}

function cropAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl = chainId.isSepolia()
    ? "https://sepolia.voyager.online/tx"
    : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}

function parseAmountInput(value: string, token: Token | null): Amount | null {
  if (!token || !value.trim()) {
    return null;
  }

  try {
    return Amount.parse(value.trim(), token);
  } catch {
    return null;
  }
}

function getAmountError(value: string, token: Token | null): string | null {
  if (!value.trim()) {
    return null;
  }
  if (!token) {
    return "Token unavailable";
  }

  try {
    const parsed = Amount.parse(value.trim(), token);
    if (parsed.toBase() <= 0n) {
      return "Amount must be greater than zero";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function amountFromBase(
  value: bigint | null | undefined,
  token: Token | null
): string {
  if (value == null || !token) {
    return EMPTY_STATE_LABEL;
  }
  return Amount.fromRaw(value, token).toFormatted(true);
}

function getExecuteOptions(
  useSponsored: boolean,
  canUseSponsored: boolean
): ExecuteOptions {
  return {
    feeMode:
      useSponsored && canUseSponsored ? FEE_MODE_SPONSORED : FEE_MODE_USER_PAYS,
  };
}

function describeCollateralOption(option: VesuAssetOption): string {
  const poolLabel = getVesuPoolLabel(option.poolAddress);
  return option.source === "market"
    ? `${poolLabel} · Collateral asset`
    : "Fallback collateral asset";
}

function DropdownField(props: {
  label: string;
  placeholder: string;
  valueLabel: string | null;
  valueDescription?: string;
  options: DropdownOption[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const backgroundColor = useThemeColor({}, "background");
  const hasOptions = props.options.length > 0;

  return (
    <>
      <View style={styles.fieldSection}>
        <ThemedText style={[styles.label, { color: textSecondary }]}>
          {props.label}
        </ThemedText>
        <TouchableOpacity
          style={[
            styles.dropdownButton,
            {
              borderColor,
              backgroundColor: hasOptions ? backgroundColor : cardBg,
            },
            !hasOptions && styles.dropdownButtonDisabled,
          ]}
          onPress={() => setOpen(true)}
          disabled={!hasOptions}
          activeOpacity={0.88}
        >
          <View style={styles.dropdownTextStack}>
            <ThemedText style={styles.dropdownValue}>
              {props.valueLabel ?? props.placeholder}
            </ThemedText>
            {!!props.valueDescription && (
              <ThemedText
                style={[styles.dropdownDescription, { color: textSecondary }]}
              >
                {props.valueDescription}
              </ThemedText>
            )}
          </View>
          <Ionicons
            name="chevron-down"
            size={16}
            color={hasOptions ? primaryColor : textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
          edges={["top"]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">{props.label}</ThemedText>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={() => setOpen(false)}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.modalCloseText, { color: primaryColor }]}
              >
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalList}
            contentContainerStyle={styles.modalListContent}
          >
            {props.options.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.dropdownOption,
                  { backgroundColor, borderColor },
                ]}
                onPress={() => {
                  props.onSelect(option.key);
                  setOpen(false);
                }}
                activeOpacity={0.88}
              >
                <ThemedText style={styles.dropdownOptionLabel}>
                  {option.label}
                </ThemedText>
                {!!option.description && (
                  <ThemedText
                    style={[
                      styles.dropdownOptionDescription,
                      { color: textSecondary },
                    ]}
                  >
                    {option.description}
                  </ThemedText>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function TokenAvatar(props: { token: Token; size?: number }) {
  const [imageError, setImageError] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const size = props.size ?? 20;
  const hasImage = !!props.token.metadata?.logoUrl && !imageError;

  if (hasImage) {
    return (
      <Image
        source={{ uri: props.token.metadata!.logoUrl!.toString() }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: borderColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ThemedText
        style={{ fontSize: Math.max(10, size / 2.2), color: primaryColor }}
      >
        {props.token.symbol.charAt(0)}
      </ThemedText>
    </View>
  );
}

function PoolAvatar(props: { poolLabel: string; size?: number }) {
  const size = props.size ?? 18;
  const poolVisual = getVesuPoolVisual(props.poolLabel);

  return (
    <View
      style={[
        styles.poolAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: poolVisual.backgroundColor,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.poolAvatarText,
          {
            color: poolVisual.foregroundColor,
            fontSize: Math.max(8, size / 2.6),
          },
        ]}
      >
        {poolVisual.shortLabel}
      </ThemedText>
    </View>
  );
}

async function fetchVesuApiMarkets(
  chainId: ChainId
): Promise<VesuApiMarketItem[]> {
  if (!chainId.isMainnet()) {
    return [];
  }

  const response = await fetch(VESU_MARKETS_API_URL);
  if (!response.ok) {
    throw new Error(`Vesu markets request failed (${response.status})`);
  }

  const payload = (await response.json()) as { data?: VesuApiMarketItem[] };
  return payload.data ?? [];
}

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

  const [markets, setMarkets] = useState<LendingMarket[]>([]);
  const [apiMarkets, setApiMarkets] = useState<VesuApiMarketItem[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [selectedVaultAssetKey, setSelectedVaultAssetKey] = useState<
    string | null
  >(null);
  const [selectedCollateralAssetKey, setSelectedCollateralAssetKey] = useState<
    string | null
  >(null);
  const [position, setPosition] = useState<LendingPosition | null>(null);
  const [health, setHealth] = useState<LendingHealth | null>(null);
  const [projectedHealth, setProjectedHealth] = useState<LendingHealth | null>(
    null
  );
  const [isRefreshingPosition, setIsRefreshingPosition] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [vaultAction, setVaultAction] = useState<VaultAction>("deposit");
  const [positionAction, setPositionAction] =
    useState<PositionAction>("borrow");
  const [vaultAmount, setVaultAmount] = useState("");
  const [borrowDebtAmount, setBorrowDebtAmount] = useState("");
  const [borrowCollateralAmount, setBorrowCollateralAmount] = useState("");
  const [repayDebtAmount, setRepayDebtAmount] = useState("");
  const [repayCollateralAmount, setRepayCollateralAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isMarketSheetOpen, setIsMarketSheetOpen] = useState(false);
  const [marketSheetTab, setMarketSheetTab] =
    useState<MarketSheetTab>("supply");
  const [useSponsored, setUseSponsored] = useState(
    preferSponsored && Boolean(paymasterNodeUrl)
  );

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const backgroundColor = useThemeColor({}, "background");

  const allTokens = useMemo(() => getTokensForNetwork(chainId), [chainId]);
  const isVesuSupported = SUPPORTED_VESU_CHAINS.has(chainId.toLiteral());
  const canUseSponsored = Boolean(paymasterNodeUrl);
  const marketColumns = width >= 1200 ? 3 : width >= 760 ? 2 : 1;
  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const resetDraftState = useCallback(() => {
    setVaultAmount("");
    setBorrowDebtAmount("");
    setBorrowCollateralAmount("");
    setRepayDebtAmount("");
    setRepayCollateralAmount("");
    setProjectedHealth(null);
    setQuoteError(null);
  }, []);

  const handleOpenMarket = useCallback(
    (option: VesuAssetOption, initialTab: MarketSheetTab = "supply") => {
      setSelectedVaultAssetKey(option.key);
      setSelectedCollateralAssetKey(null);
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
    setSelectedCollateralAssetKey(null);
    setPosition(null);
    setHealth(null);
    setPositionError(null);
    setVaultAction("deposit");
    setPositionAction("borrow");
    resetDraftState();
  }, [resetDraftState]);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    if (walletType === "privy") {
      await logout();
    }
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [clearBalances, disconnect, resetNetworkConfig, walletType, logout]);

  useEffect(() => {
    setUseSponsored(preferSponsored && Boolean(paymasterNodeUrl));
  }, [paymasterNodeUrl, preferSponsored]);

  const assetOptions = useMemo(
    () => buildVesuAssetOptions({ chainId, markets, tokens: allTokens }),
    [allTokens, chainId, markets]
  );
  const marketCards = useMemo(
    () =>
      buildVesuMarketCards({
        options: assetOptions,
        apiMarkets,
        knownTokens: allTokens,
      }),
    [allTokens, apiMarkets, assetOptions]
  );

  const selectedVaultAsset = useMemo(
    () =>
      selectedVaultAssetKey
        ? (assetOptions.find(
            (option) => option.key === selectedVaultAssetKey
          ) ?? null)
        : null,
    [assetOptions, selectedVaultAssetKey]
  );
  const selectedDebtAsset = useMemo(() => {
    if (!selectedVaultAsset?.canBorrow) {
      return null;
    }
    return selectedVaultAsset;
  }, [selectedVaultAsset]);
  const collateralOptions = useMemo(
    () => getAvailableVesuCollateralAssets(assetOptions, selectedDebtAsset),
    [assetOptions, selectedDebtAsset]
  );
  const selectedCollateralAsset = useMemo(
    () =>
      collateralOptions.find(
        (option) => option.key === selectedCollateralAssetKey
      ) ?? getDefaultVesuCollateralAsset(collateralOptions, selectedDebtAsset),
    [collateralOptions, selectedCollateralAssetKey, selectedDebtAsset]
  );
  const selectedCollateralToken = selectedCollateralAsset?.token ?? null;
  const selectedMarketCard = useMemo(
    () =>
      selectedVaultAssetKey
        ? (marketCards.find((card) => card.key === selectedVaultAssetKey) ??
          null)
        : null,
    [marketCards, selectedVaultAssetKey]
  );

  const vaultBalance = selectedVaultAsset
    ? getBalance(selectedVaultAsset.token)
    : null;
  const collateralWalletBalance = selectedCollateralToken
    ? getBalance(selectedCollateralToken)
    : null;
  const debtWalletBalance = selectedDebtAsset
    ? getBalance(selectedDebtAsset.token)
    : null;

  const vaultAmountError = getAmountError(
    vaultAmount,
    selectedVaultAsset?.token ?? null
  );
  const borrowDebtAmountError = getAmountError(
    borrowDebtAmount,
    selectedDebtAsset?.token ?? null
  );
  const borrowCollateralAmountError = getAmountError(
    borrowCollateralAmount,
    selectedCollateralToken ?? null
  );
  const repayDebtAmountError = getAmountError(
    repayDebtAmount,
    selectedDebtAsset?.token ?? null
  );
  const repayCollateralAmountError = getAmountError(
    repayCollateralAmount,
    selectedCollateralToken ?? null
  );

  const currentStatus = getVesuHealthStatus(health, position);
  const projectedStatus = getVesuHealthStatus(projectedHealth, position);
  const currentCollateralAmount = amountFromBase(
    position?.collateralAmount,
    selectedCollateralToken ?? null
  );
  const currentDebtAmount = amountFromBase(
    position?.debtAmount,
    selectedDebtAsset?.token ?? null
  );

  const collateralDropdownOptions = useMemo<DropdownOption[]>(
    () =>
      collateralOptions.map((option) => ({
        key: option.key,
        label: option.token.symbol,
        description: describeCollateralOption(option),
      })),
    [collateralOptions]
  );

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
    if (!wallet) {
      return;
    }
    await Clipboard.setStringAsync(wallet.address);
    addLog("Wallet address copied");
    showCopiedToast();
  }, [addLog, wallet]);

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
      setPositionError(null);
      return;
    }

    const request = {
      provider: VESU_PROVIDER_ID,
      ...(selectedDebtAsset.poolAddress
        ? { poolAddress: selectedDebtAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
    };

    setIsRefreshingPosition(true);
    setPositionError(null);

    try {
      const [nextPosition, nextHealth] = await Promise.all([
        wallet.lending().getPosition(request),
        wallet.lending().getHealth(request),
      ]);
      setPosition(nextPosition);
      setHealth(nextHealth);
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
    wallet,
  ]);

  const loadMarkets = useCallback(async () => {
    if (!wallet || !isVesuSupported) {
      setMarkets([]);
      setApiMarkets([]);
      setMarketError(null);
      return;
    }

    setIsLoadingMarkets(true);
    setMarketError(null);

    try {
      const nextMarketsPromise = wallet
        .lending()
        .getMarkets({ provider: VESU_PROVIDER_ID });
      const nextApiMarketsPromise = fetchVesuApiMarkets(chainId).catch(
        (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          addLog(`Vesu stats fetch failed: ${message}`);
          return [];
        }
      );

      const [nextMarkets, nextApiMarkets] = await Promise.all([
        nextMarketsPromise,
        nextApiMarketsPromise,
      ]);
      setMarkets(nextMarkets);
      setApiMarkets(nextApiMarkets);

      if (!nextMarkets.length) {
        addLog(
          "Vesu market discovery returned no metadata; using fallback assets"
        );
      } else {
        addLog(
          `Loaded ${nextMarkets.length} Vesu SDK markets and ${nextApiMarkets.length} Vesu stats entries`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMarketError(message);
      setMarkets([]);
      setApiMarkets([]);
      addLog(`Vesu market discovery failed: ${message}`);
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [addLog, chainId, isVesuSupported, wallet]);

  const handleRefresh = useCallback(async () => {
    if (!wallet) {
      return;
    }

    setProjectedHealth(null);
    setQuoteError(null);
    await Promise.all([
      fetchBalances(wallet, chainId),
      loadMarkets(),
      refreshPosition(),
    ]);
  }, [chainId, fetchBalances, loadMarkets, refreshPosition, wallet]);

  useEffect(() => {
    if (!wallet) {
      return;
    }
    void fetchBalances(wallet, chainId);
  }, [chainId, fetchBalances, wallet]);

  useEffect(() => {
    if (!wallet) {
      return;
    }
    void loadMarkets();
  }, [loadMarkets, wallet]);

  useEffect(() => {
    if (!wallet) {
      return;
    }
    void refreshPosition();
  }, [refreshPosition, wallet]);

  useEffect(() => {
    handleCloseMarket();
  }, [chainId, handleCloseMarket]);

  useEffect(() => {
    setProjectedHealth(null);
    setQuoteError(null);
  }, [
    marketSheetTab,
    positionAction,
    selectedCollateralToken?.address,
    selectedDebtAsset?.key,
    borrowCollateralAmount,
    borrowDebtAmount,
    repayCollateralAmount,
    repayDebtAmount,
  ]);

  useEffect(() => {
    if (marketSheetTab === "borrow" && !selectedMarketCard?.option.canBorrow) {
      setMarketSheetTab("supply");
    }
  }, [marketSheetTab, selectedMarketCard]);

  const handlePreview = useCallback(async () => {
    if (
      !wallet ||
      !selectedDebtAsset ||
      !selectedCollateralToken ||
      !isVesuSupported
    ) {
      return;
    }

    const commonRequest = {
      provider: VESU_PROVIDER_ID,
      ...(selectedDebtAsset.poolAddress
        ? { poolAddress: selectedDebtAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
    };

    const debtAmount =
      positionAction === "borrow"
        ? parseAmountInput(borrowDebtAmount, selectedDebtAsset.token)
        : parseAmountInput(repayDebtAmount, selectedDebtAsset.token);
    const collateralAmount =
      positionAction === "borrow"
        ? parseAmountInput(borrowCollateralAmount, selectedCollateralToken)
        : parseAmountInput(repayCollateralAmount, selectedCollateralToken);

    if (!debtAmount) {
      setQuoteError("Enter a valid debt amount first");
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);

    try {
      const quote = await wallet.lending().quoteHealth({
        action:
          positionAction === "borrow"
            ? {
                action: "borrow",
                request: {
                  ...commonRequest,
                  amount: debtAmount,
                  ...(collateralAmount ? { collateralAmount } : {}),
                },
              }
            : {
                action: "repay",
                request: {
                  ...commonRequest,
                  amount: debtAmount,
                  ...(collateralAmount
                    ? {
                        collateralAmount,
                        withdrawCollateral: true,
                      }
                    : {}),
                },
              },
        health: commonRequest,
        feeMode: getExecuteOptions(useSponsored, canUseSponsored).feeMode,
      });

      setHealth(quote.current);
      setProjectedHealth(quote.projected ?? null);
      if (!quote.simulation.ok) {
        setQuoteError(quote.simulation.reason);
      } else {
        addLog(
          `Vesu ${positionAction} preview succeeded (${quote.projected ? "projected health available" : "no projected health"})`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQuoteError(message);
      setProjectedHealth(null);
      addLog(`Vesu preview failed: ${message}`);
    } finally {
      setIsQuoting(false);
    }
  }, [
    addLog,
    borrowCollateralAmount,
    borrowDebtAmount,
    canUseSponsored,
    isVesuSupported,
    positionAction,
    repayCollateralAmount,
    repayDebtAmount,
    selectedCollateralToken,
    selectedDebtAsset,
    useSponsored,
    wallet,
  ]);

  const handleVaultSubmit = useCallback(async () => {
    if (!wallet || !selectedVaultAsset) {
      return;
    }

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
          ? await wallet.lending().deposit(
              {
                ...requestBase,
                amount,
              },
              options
            )
          : await wallet.lending().withdraw(
              {
                ...requestBase,
                amount,
              },
              options
            );

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
    if (!wallet || !selectedVaultAsset) {
      return;
    }

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
    ) {
      return;
    }

    const commonRequest = {
      provider: VESU_PROVIDER_ID,
      ...(selectedDebtAsset.poolAddress
        ? { poolAddress: selectedDebtAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
    };

    const debtAmount =
      positionAction === "borrow"
        ? parseAmountInput(borrowDebtAmount, selectedDebtAsset.token)
        : parseAmountInput(repayDebtAmount, selectedDebtAsset.token);
    const collateralAmount =
      positionAction === "borrow"
        ? parseAmountInput(borrowCollateralAmount, selectedCollateralToken)
        : parseAmountInput(repayCollateralAmount, selectedCollateralToken);

    if (!debtAmount) {
      Alert.alert("Vesu", "Enter a valid debt amount first.");
      return;
    }

    setIsSubmitting(true);

    try {
      const options = getExecuteOptions(useSponsored, canUseSponsored);
      const tx =
        positionAction === "borrow"
          ? await wallet.lending().borrow(
              {
                ...commonRequest,
                amount: debtAmount,
                ...(collateralAmount ? { collateralAmount } : {}),
              },
              options
            )
          : await wallet.lending().repay(
              {
                ...commonRequest,
                amount: debtAmount,
                ...(collateralAmount
                  ? {
                      collateralAmount,
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
            : "Repaying Vesu Debt",
        pendingSubtitle:
          positionAction === "borrow"
            ? `Borrowing ${debtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`
            : `Repaying ${debtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`,
        successTitle:
          positionAction === "borrow"
            ? "Vesu Borrow Complete"
            : "Vesu Repay Complete",
        successSubtitle:
          positionAction === "borrow"
            ? `Borrowed ${debtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`
            : `Repaid ${debtAmount.toUnit()} ${selectedDebtAsset.token.symbol}`,
      });

      if (positionAction === "borrow") {
        setBorrowDebtAmount("");
        setBorrowCollateralAmount("");
      } else {
        setRepayDebtAmount("");
        setRepayCollateralAmount("");
      }
      setProjectedHealth(null);
      await Promise.all([
        fetchBalances(wallet, chainId),
        loadMarkets(),
        refreshPosition(),
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
    borrowCollateralAmount,
    borrowDebtAmount,
    canUseSponsored,
    chainId,
    fetchBalances,
    isVesuSupported,
    loadMarkets,
    positionAction,
    refreshPosition,
    repayCollateralAmount,
    repayDebtAmount,
    selectedCollateralToken,
    selectedDebtAsset,
    trackTransaction,
    useSponsored,
    wallet,
  ]);

  if (!wallet) {
    return null;
  }

  const hasBorrowExposure = hasVesuExposure(position);
  const borrowRequiresCollateralInput =
    marketSheetTab === "borrow" &&
    positionAction === "borrow" &&
    !!selectedDebtAsset &&
    !isRefreshingPosition &&
    !hasBorrowExposure;
  const canSubmitVault =
    !!selectedVaultAsset &&
    !!vaultAmount.trim() &&
    !vaultAmountError &&
    !isSubmitting;
  const canPreviewPosition =
    !!selectedDebtAsset &&
    !!selectedCollateralToken &&
    !isSubmitting &&
    !isQuoting &&
    !isRefreshingPosition &&
    (positionAction === "borrow"
      ? !!borrowDebtAmount.trim() &&
        !borrowDebtAmountError &&
        !borrowCollateralAmountError &&
        (!borrowRequiresCollateralInput || !!borrowCollateralAmount.trim())
      : !!repayDebtAmount.trim() &&
        !repayDebtAmountError &&
        !repayCollateralAmountError);
  const canSubmitPosition =
    !!selectedDebtAsset &&
    !!selectedCollateralToken &&
    !isSubmitting &&
    !isRefreshingPosition &&
    (positionAction === "borrow"
      ? !!borrowDebtAmount.trim() &&
        !borrowDebtAmountError &&
        !borrowCollateralAmountError &&
        (!borrowRequiresCollateralInput || !!borrowCollateralAmount.trim())
      : !!repayDebtAmount.trim() &&
        !repayDebtAmountError &&
        !repayCollateralAmountError);
  const borrowSubmitLabel =
    positionAction === "borrow"
      ? borrowRequiresCollateralInput
        ? "Deposit Collateral & Borrow"
        : "Submit Borrow"
      : "Submit Repay";

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
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <ThemedText type="title">Vesu</ThemedText>
          </View>
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
              <ThemedText type="link" style={styles.disconnectLink}>
                Disconnect
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
        <ThemedText style={[styles.headerSubtitle, { color: textSecondary }]}>
          Lending and borrowing by market
        </ThemedText>

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
              <ThemedText style={styles.addressText}>
                {cropAddress(wallet.address)}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {!isVesuSupported && (
            <ThemedText style={[styles.infoText, { color: textSecondary }]}>
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
                    style={[styles.infoText, { color: textSecondary }]}
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
                  {marketCards.map((card) => {
                    const isSelected =
                      isMarketSheetOpen && selectedMarketCard?.key === card.key;
                    return (
                      <TouchableOpacity
                        key={card.key}
                        style={[
                          styles.marketCard,
                          {
                            borderColor: isSelected ? "#000" : borderColor,
                            backgroundColor: cardBg,
                            width:
                              marketColumns === 1
                                ? "100%"
                                : marketColumns === 2
                                  ? "48.5%"
                                  : "32%",
                          },
                        ]}
                        onPress={() => handleOpenMarket(card.option)}
                        activeOpacity={0.92}
                      >
                        <View style={styles.marketCardHeader}>
                          <View style={styles.marketCardToken}>
                            <TokenAvatar token={card.option.token} size={38} />
                            <View style={styles.marketCardTokenText}>
                              <ThemedText style={styles.marketCardSymbol}>
                                {card.option.token.symbol}
                              </ThemedText>
                              <View style={styles.marketCardPoolRow}>
                                <PoolAvatar poolLabel={card.poolLabel} />
                                <ThemedText
                                  style={[
                                    styles.marketCardPool,
                                    { color: textSecondary },
                                  ]}
                                >
                                  {card.poolLabel}
                                </ThemedText>
                              </View>
                            </View>
                          </View>
                          {isSelected && (
                            <View
                              style={[
                                styles.marketSelectedPill,
                                { backgroundColor: "#000" },
                              ]}
                            >
                              <ThemedText style={styles.marketSelectedPillText}>
                                Open
                              </ThemedText>
                            </View>
                          )}
                        </View>

                        <View style={styles.marketMetricsGrid}>
                          <View style={styles.marketMetricCell}>
                            <ThemedText
                              style={[
                                styles.marketMetricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Total supplied
                            </ThemedText>
                            <ThemedText style={styles.marketMetricValue}>
                              {card.totalSuppliedLabel}
                            </ThemedText>
                          </View>
                          <View style={styles.marketMetricCell}>
                            <ThemedText
                              style={[
                                styles.marketMetricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Total borrowed
                            </ThemedText>
                            <ThemedText style={styles.marketMetricValue}>
                              {card.totalBorrowedLabel}
                            </ThemedText>
                          </View>
                          <View style={styles.marketMetricCell}>
                            <ThemedText
                              style={[
                                styles.marketMetricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Supply APR
                            </ThemedText>
                            <ThemedText style={styles.marketMetricValue}>
                              {card.supplyAprLabel}
                            </ThemedText>
                          </View>
                          <View style={styles.marketMetricCell}>
                            <ThemedText
                              style={[
                                styles.marketMetricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Borrow APR
                            </ThemedText>
                            <ThemedText style={styles.marketMetricValue}>
                              {card.borrowAprLabel}
                            </ThemedText>
                          </View>
                        </View>

                        <View style={styles.marketCollateralSection}>
                          <ThemedText
                            style={[
                              styles.marketMetricLabel,
                              { color: textSecondary },
                            ]}
                          >
                            Collateral
                          </ThemedText>
                          {card.option.canBorrow ? (
                            <View style={styles.collateralTokenRow}>
                              {card.collateralTokens.length > 0 ? (
                                card.collateralTokens.map((token, index) => (
                                  <View
                                    key={`${card.key}:${token.address}`}
                                    style={[
                                      styles.collateralTokenAvatar,
                                      { marginLeft: index === 0 ? 0 : -8 },
                                    ]}
                                  >
                                    <TokenAvatar token={token} size={24} />
                                  </View>
                                ))
                              ) : (
                                <ThemedText
                                  style={[
                                    styles.marketCardHint,
                                    { color: textSecondary },
                                  ]}
                                >
                                  Same-pool collateral metadata unavailable
                                </ThemedText>
                              )}
                            </View>
                          ) : (
                            <ThemedText
                              style={[
                                styles.marketCardHint,
                                { color: textSecondary },
                              ]}
                            >
                              Borrowing of {card.option.token.symbol} not
                              enabled
                            </ThemedText>
                          )}
                        </View>

                        <View style={styles.marketCardButton}>
                          <ThemedText style={styles.marketCardButtonText}>
                            Supply & Borrow {card.option.token.symbol}
                          </ThemedText>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <ThemedText style={[styles.infoText, { color: textSecondary }]}>
                  No Vesu markets are currently available for this network.
                </ThemedText>
              )}

              <ThemedText style={[styles.infoText, { color: textSecondary }]}>
                Tap a market card to open its supply and borrow flow for that
                pool.
              </ThemedText>

              <View style={styles.sponsoredRow}>
                <ThemedText style={[styles.label, { color: textSecondary }]}>
                  Sponsored Mode
                </ThemedText>
                <View
                  style={[
                    styles.sponsoredSwitch,
                    !canUseSponsored && styles.sponsoredSwitchDisabled,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.sponsoredSegment,
                      !useSponsored && styles.sponsoredSegmentSelected,
                    ]}
                    onPress={() => setUseSponsored(false)}
                    disabled={!canUseSponsored}
                    activeOpacity={0.88}
                  >
                    <ThemedText
                      style={[
                        styles.sponsoredText,
                        !useSponsored && styles.sponsoredTextSelected,
                      ]}
                    >
                      Off
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sponsoredSegment,
                      useSponsored && styles.sponsoredSegmentSelected,
                    ]}
                    onPress={() => setUseSponsored(true)}
                    disabled={!canUseSponsored}
                    activeOpacity={0.88}
                  >
                    <ThemedText
                      style={[
                        styles.sponsoredText,
                        useSponsored && styles.sponsoredTextSelected,
                      ]}
                    >
                      On
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {!canUseSponsored && (
                <ThemedText style={[styles.infoText, { color: textSecondary }]}>
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
              <View
                style={[styles.modalHeader, { borderBottomColor: borderColor }]}
              >
                <View style={styles.marketCardToken}>
                  <TokenAvatar
                    token={selectedMarketCard.option.token}
                    size={42}
                  />
                  <View style={styles.marketCardTokenText}>
                    <ThemedText style={styles.marketSheetTitle}>
                      {selectedMarketCard.option.token.symbol}
                    </ThemedText>
                    <View style={styles.marketCardPoolRow}>
                      <PoolAvatar
                        poolLabel={selectedMarketCard.poolLabel}
                        size={20}
                      />
                      <ThemedText
                        style={[
                          styles.marketSheetSubtitle,
                          { color: textSecondary },
                        ]}
                      >
                        {selectedMarketCard.poolLabel}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.modalCloseButton,
                    { backgroundColor: borderColor },
                  ]}
                  onPress={handleCloseMarket}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[styles.modalCloseText, { color: primaryColor }]}
                  >
                    Close
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalList}
                contentContainerStyle={styles.marketSheetContent}
              >
                <View
                  style={[
                    styles.card,
                    styles.marketOverviewCard,
                    { backgroundColor, borderColor },
                  ]}
                >
                  <View style={styles.marketMetricsGrid}>
                    <View style={styles.marketMetricCell}>
                      <ThemedText
                        style={[
                          styles.marketMetricLabel,
                          { color: textSecondary },
                        ]}
                      >
                        Total supplied
                      </ThemedText>
                      <ThemedText style={styles.marketMetricValue}>
                        {selectedMarketCard.totalSuppliedLabel}
                      </ThemedText>
                    </View>
                    <View style={styles.marketMetricCell}>
                      <ThemedText
                        style={[
                          styles.marketMetricLabel,
                          { color: textSecondary },
                        ]}
                      >
                        Total borrowed
                      </ThemedText>
                      <ThemedText style={styles.marketMetricValue}>
                        {selectedMarketCard.totalBorrowedLabel}
                      </ThemedText>
                    </View>
                    <View style={styles.marketMetricCell}>
                      <ThemedText
                        style={[
                          styles.marketMetricLabel,
                          { color: textSecondary },
                        ]}
                      >
                        Supply APR
                      </ThemedText>
                      <ThemedText style={styles.marketMetricValue}>
                        {selectedMarketCard.supplyAprLabel}
                      </ThemedText>
                    </View>
                    <View style={styles.marketMetricCell}>
                      <ThemedText
                        style={[
                          styles.marketMetricLabel,
                          { color: textSecondary },
                        ]}
                      >
                        Borrow APR
                      </ThemedText>
                      <ThemedText style={styles.marketMetricValue}>
                        {selectedMarketCard.borrowAprLabel}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.marketCollateralSection}>
                    <ThemedText
                      style={[
                        styles.marketMetricLabel,
                        { color: textSecondary },
                      ]}
                    >
                      Collateral
                    </ThemedText>
                    {selectedMarketCard.option.canBorrow ? (
                      <View style={styles.collateralTokenRow}>
                        {selectedMarketCard.collateralTokens.length > 0 ? (
                          selectedMarketCard.collateralTokens.map(
                            (token, index) => (
                              <View
                                key={`${selectedMarketCard.key}:${token.address}`}
                                style={[
                                  styles.collateralTokenAvatar,
                                  { marginLeft: index === 0 ? 0 : -8 },
                                ]}
                              >
                                <TokenAvatar token={token} size={26} />
                              </View>
                            )
                          )
                        ) : (
                          <ThemedText
                            style={[
                              styles.marketCardHint,
                              { color: textSecondary },
                            ]}
                          >
                            Same-pool collateral metadata unavailable
                          </ThemedText>
                        )}
                      </View>
                    ) : (
                      <ThemedText
                        style={[
                          styles.marketCardHint,
                          { color: textSecondary },
                        ]}
                      >
                        Borrowing of {selectedMarketCard.option.token.symbol} is
                        not enabled on this market.
                      </ThemedText>
                    )}
                  </View>
                </View>

                <View
                  style={[
                    styles.marketTabRow,
                    { backgroundColor, borderColor },
                  ]}
                >
                  {(["supply", "borrow"] as const).map((tab) => {
                    const isActive = marketSheetTab === tab;
                    const isDisabled =
                      tab === "borrow" && !selectedMarketCard.option.canBorrow;
                    return (
                      <TouchableOpacity
                        key={tab}
                        style={[
                          styles.marketTabButton,
                          isActive && styles.marketTabButtonActive,
                          isDisabled && styles.marketTabButtonDisabled,
                        ]}
                        onPress={() => {
                          if (isDisabled) {
                            return;
                          }
                          setMarketSheetTab(tab);
                          if (tab === "borrow") {
                            setPositionAction("borrow");
                          }
                        }}
                        disabled={isDisabled}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.marketTabText,
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

                    <View style={styles.pillRow}>
                      {(["deposit", "withdraw"] as const).map((action) => {
                        const isSelected = vaultAction === action;
                        return (
                          <TouchableOpacity
                            key={action}
                            style={[
                              styles.pill,
                              isSelected && styles.pillSelected,
                              {
                                borderColor,
                                backgroundColor: isSelected
                                  ? "#000"
                                  : backgroundColor,
                              },
                            ]}
                            onPress={() => setVaultAction(action)}
                            activeOpacity={0.88}
                          >
                            <ThemedText
                              style={[
                                styles.pillText,
                                { color: isSelected ? "#fff" : primaryColor },
                              ]}
                            >
                              {action === "deposit" ? "Deposit" : "Withdraw"}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={styles.amountSection}>
                      <View style={styles.amountLabelRow}>
                        <ThemedText
                          style={[styles.label, { color: textSecondary }]}
                        >
                          Amount
                        </ThemedText>
                        <ThemedText
                          style={[styles.infoText, { color: textSecondary }]}
                        >
                          {vaultAction === "deposit"
                            ? `Wallet ${vaultBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}`
                            : "Use Withdraw Max to redeem your full Vesu position"}
                        </ThemedText>
                      </View>
                      <View style={[styles.amountRow, { borderColor }]}>
                        <TextInput
                          style={[styles.amountInput, { color: primaryColor }]}
                          value={vaultAmount}
                          onChangeText={setVaultAmount}
                          placeholder="0.0"
                          placeholderTextColor={textSecondary}
                          keyboardType="decimal-pad"
                        />
                        {vaultAction === "deposit" &&
                          selectedVaultAsset &&
                          vaultBalance && (
                            <TouchableOpacity
                              style={[
                                styles.maxButton,
                                { backgroundColor: borderColor },
                              ]}
                              onPress={() =>
                                setVaultAmount(vaultBalance.toUnit())
                              }
                              activeOpacity={0.88}
                            >
                              <ThemedText
                                style={[
                                  styles.maxButtonText,
                                  { color: primaryColor },
                                ]}
                              >
                                MAX
                              </ThemedText>
                            </TouchableOpacity>
                          )}
                      </View>
                      {vaultAmountError && (
                        <ThemedText style={styles.errorText}>
                          {vaultAmountError}
                        </ThemedText>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.submitButton,
                        canSubmitVault
                          ? { backgroundColor: "#000" }
                          : { backgroundColor: borderColor },
                        !canSubmitVault && styles.buttonDisabled,
                      ]}
                      onPress={() => void handleVaultSubmit()}
                      disabled={!canSubmitVault}
                      activeOpacity={0.88}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <ThemedText
                          style={[
                            styles.submitButtonText,
                            { color: canSubmitVault ? "#fff" : primaryColor },
                          ]}
                        >
                          {vaultAction === "deposit"
                            ? "Submit Deposit"
                            : "Submit Withdraw"}
                        </ThemedText>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.secondaryButton,
                        { borderColor, backgroundColor },
                        (isSubmitting || !selectedVaultAsset) &&
                          styles.buttonDisabled,
                      ]}
                      onPress={() => void handleWithdrawMax()}
                      disabled={isSubmitting || !selectedVaultAsset}
                      activeOpacity={0.88}
                    >
                      <ThemedText
                        style={[
                          styles.secondaryButtonText,
                          { color: primaryColor },
                        ]}
                      >
                        Withdraw Max
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                )}

                {marketSheetTab === "borrow" &&
                  selectedMarketCard.option.canBorrow && (
                    <>
                      <View
                        style={[
                          styles.card,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <View style={styles.cardHeader}>
                          <ThemedText style={styles.cardTitle}>
                            Position Health
                          </ThemedText>
                          <TouchableOpacity
                            onPress={() => void refreshPosition()}
                            style={[
                              styles.refreshButton,
                              { backgroundColor: borderColor },
                            ]}
                            disabled={isRefreshingPosition}
                            activeOpacity={0.88}
                          >
                            {isRefreshingPosition ? (
                              <ActivityIndicator
                                size="small"
                                color={primaryColor}
                              />
                            ) : (
                              <Ionicons
                                name="refresh"
                                size={14}
                                color={primaryColor}
                              />
                            )}
                          </TouchableOpacity>
                        </View>

                        {positionError && (
                          <ThemedText style={styles.errorText}>
                            {positionError}
                          </ThemedText>
                        )}

                        <View style={styles.metricsRow}>
                          <View style={styles.metricCard}>
                            <ThemedText
                              style={[
                                styles.metricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Status
                            </ThemedText>
                            <ThemedText style={styles.metricValue}>
                              {currentStatus}
                            </ThemedText>
                          </View>
                          <View style={styles.metricCard}>
                            <ThemedText
                              style={[
                                styles.metricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              LTV
                            </ThemedText>
                            <ThemedText style={styles.metricValue}>
                              {formatVesuLtv(health)}
                            </ThemedText>
                          </View>
                        </View>

                        <View style={styles.metricsRow}>
                          <View style={styles.metricCard}>
                            <ThemedText
                              style={[
                                styles.metricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Collateral
                            </ThemedText>
                            <ThemedText style={styles.metricValue}>
                              {currentCollateralAmount}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.metricHint,
                                { color: textSecondary },
                              ]}
                            >
                              {formatVesuUsdValue(health?.collateralValue)}
                            </ThemedText>
                          </View>
                          <View style={styles.metricCard}>
                            <ThemedText
                              style={[
                                styles.metricLabel,
                                { color: textSecondary },
                              ]}
                            >
                              Debt
                            </ThemedText>
                            <ThemedText style={styles.metricValue}>
                              {currentDebtAmount}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.metricHint,
                                { color: textSecondary },
                              ]}
                            >
                              {formatVesuUsdValue(health?.debtValue)}
                            </ThemedText>
                          </View>
                        </View>

                        {projectedHealth && (
                          <View
                            style={[
                              styles.projectedCard,
                              { backgroundColor, borderColor },
                            ]}
                          >
                            <ThemedText style={styles.cardTitle}>
                              Projected After Preview
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.metricHint,
                                { color: textSecondary },
                              ]}
                            >
                              {projectedStatus} ·{" "}
                              {formatVesuLtv(projectedHealth)}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.metricHint,
                                { color: textSecondary },
                              ]}
                            >
                              Collateral{" "}
                              {formatVesuUsdValue(
                                projectedHealth.collateralValue
                              )}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.metricHint,
                                { color: textSecondary },
                              ]}
                            >
                              Debt{" "}
                              {formatVesuUsdValue(projectedHealth.debtValue)}
                            </ThemedText>
                          </View>
                        )}
                      </View>

                      {borrowRequiresCollateralInput && (
                        <View
                          style={[
                            styles.noticeCard,
                            { backgroundColor, borderColor },
                          ]}
                        >
                          <ThemedText style={styles.noticeTitle}>
                            Deposit collateral first
                          </ThemedText>
                          <ThemedText
                            style={[
                              styles.noticeText,
                              { color: textSecondary },
                            ]}
                          >
                            This market needs collateral before you can borrow.
                            Pick a same-pool collateral asset below and enter
                            the amount to add, or switch to a collateral asset
                            you already supplied in this pool.
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
                            ? `Borrow ${selectedMarketCard.option.token.symbol}`
                            : `Repay ${selectedMarketCard.option.token.symbol}`}
                        </ThemedText>

                        <DropdownField
                          label="Collateral Asset"
                          placeholder="No Vesu collateral assets"
                          valueLabel={
                            selectedCollateralAsset?.token.symbol ?? null
                          }
                          valueDescription={
                            selectedCollateralAsset
                              ? describeCollateralOption(
                                  selectedCollateralAsset
                                )
                              : undefined
                          }
                          options={collateralDropdownOptions}
                          onSelect={setSelectedCollateralAssetKey}
                        />

                        <View style={styles.pillRow}>
                          {(["borrow", "repay"] as const).map((action) => {
                            const isSelected = positionAction === action;
                            return (
                              <TouchableOpacity
                                key={action}
                                style={[
                                  styles.pill,
                                  isSelected && styles.pillSelected,
                                  {
                                    borderColor,
                                    backgroundColor: isSelected
                                      ? "#000"
                                      : backgroundColor,
                                  },
                                ]}
                                onPress={() => setPositionAction(action)}
                                activeOpacity={0.88}
                              >
                                <ThemedText
                                  style={[
                                    styles.pillText,
                                    {
                                      color: isSelected ? "#fff" : primaryColor,
                                    },
                                  ]}
                                >
                                  {action === "borrow" ? "Borrow" : "Repay"}
                                </ThemedText>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <View style={styles.amountSection}>
                          <View style={styles.amountLabelRow}>
                            <ThemedText
                              style={[styles.label, { color: textSecondary }]}
                            >
                              {positionAction === "borrow"
                                ? "Collateral to Add"
                                : "Collateral to Withdraw"}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.infoText,
                                { color: textSecondary },
                              ]}
                            >
                              {positionAction === "borrow"
                                ? `Wallet ${collateralWalletBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}`
                                : `Position ${amountFromBase(
                                    position?.collateralAmount,
                                    selectedCollateralToken ?? null
                                  )}`}
                            </ThemedText>
                          </View>
                          <View style={[styles.amountRow, { borderColor }]}>
                            <TextInput
                              style={[
                                styles.amountInput,
                                { color: primaryColor },
                              ]}
                              value={
                                positionAction === "borrow"
                                  ? borrowCollateralAmount
                                  : repayCollateralAmount
                              }
                              onChangeText={
                                positionAction === "borrow"
                                  ? setBorrowCollateralAmount
                                  : setRepayCollateralAmount
                              }
                              placeholder="0.0"
                              placeholderTextColor={textSecondary}
                              keyboardType="decimal-pad"
                            />
                            <TouchableOpacity
                              style={[
                                styles.maxButton,
                                { backgroundColor: borderColor },
                              ]}
                              onPress={() => {
                                if (positionAction === "borrow") {
                                  setBorrowCollateralAmount(
                                    collateralWalletBalance?.toUnit() ?? ""
                                  );
                                  return;
                                }
                                setRepayCollateralAmount(
                                  selectedCollateralToken &&
                                    position?.collateralAmount != null
                                    ? Amount.fromRaw(
                                        position.collateralAmount,
                                        selectedCollateralToken
                                      ).toUnit()
                                    : ""
                                );
                              }}
                              activeOpacity={0.88}
                            >
                              <ThemedText
                                style={[
                                  styles.maxButtonText,
                                  { color: primaryColor },
                                ]}
                              >
                                MAX
                              </ThemedText>
                            </TouchableOpacity>
                          </View>
                          {positionAction === "borrow" &&
                            borrowCollateralAmountError && (
                              <ThemedText style={styles.errorText}>
                                {borrowCollateralAmountError}
                              </ThemedText>
                            )}
                          {positionAction === "repay" &&
                            repayCollateralAmountError && (
                              <ThemedText style={styles.errorText}>
                                {repayCollateralAmountError}
                              </ThemedText>
                            )}
                        </View>

                        <View style={styles.amountSection}>
                          <View style={styles.amountLabelRow}>
                            <ThemedText
                              style={[styles.label, { color: textSecondary }]}
                            >
                              {positionAction === "borrow"
                                ? "Debt to Borrow"
                                : "Debt to Repay"}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.infoText,
                                { color: textSecondary },
                              ]}
                            >
                              Wallet{" "}
                              {debtWalletBalance?.toFormatted(true) ??
                                EMPTY_STATE_LABEL}
                            </ThemedText>
                          </View>
                          <View style={[styles.amountRow, { borderColor }]}>
                            <TextInput
                              style={[
                                styles.amountInput,
                                { color: primaryColor },
                              ]}
                              value={
                                positionAction === "borrow"
                                  ? borrowDebtAmount
                                  : repayDebtAmount
                              }
                              onChangeText={
                                positionAction === "borrow"
                                  ? setBorrowDebtAmount
                                  : setRepayDebtAmount
                              }
                              placeholder="0.0"
                              placeholderTextColor={textSecondary}
                              keyboardType="decimal-pad"
                            />
                            {positionAction === "repay" &&
                              debtWalletBalance && (
                                <TouchableOpacity
                                  style={[
                                    styles.maxButton,
                                    { backgroundColor: borderColor },
                                  ]}
                                  onPress={() =>
                                    setRepayDebtAmount(
                                      debtWalletBalance.toUnit()
                                    )
                                  }
                                  activeOpacity={0.88}
                                >
                                  <ThemedText
                                    style={[
                                      styles.maxButtonText,
                                      { color: primaryColor },
                                    ]}
                                  >
                                    MAX
                                  </ThemedText>
                                </TouchableOpacity>
                              )}
                          </View>
                          {positionAction === "borrow" &&
                            borrowDebtAmountError && (
                              <ThemedText style={styles.errorText}>
                                {borrowDebtAmountError}
                              </ThemedText>
                            )}
                          {positionAction === "repay" &&
                            repayDebtAmountError && (
                              <ThemedText style={styles.errorText}>
                                {repayDebtAmountError}
                              </ThemedText>
                            )}
                        </View>

                        {quoteError && (
                          <ThemedText style={styles.errorText}>
                            {quoteError}
                          </ThemedText>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.secondaryButton,
                            { borderColor, backgroundColor },
                            !canPreviewPosition && styles.buttonDisabled,
                          ]}
                          onPress={() => void handlePreview()}
                          disabled={!canPreviewPosition}
                          activeOpacity={0.88}
                        >
                          {isQuoting ? (
                            <ActivityIndicator
                              size="small"
                              color={primaryColor}
                            />
                          ) : (
                            <ThemedText
                              style={[
                                styles.secondaryButtonText,
                                { color: primaryColor },
                              ]}
                            >
                              Preview Health
                            </ThemedText>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.submitButton,
                            canSubmitPosition
                              ? { backgroundColor: "#000" }
                              : { backgroundColor: borderColor },
                            !canSubmitPosition && styles.buttonDisabled,
                          ]}
                          onPress={() => void handlePositionSubmit()}
                          disabled={!canSubmitPosition}
                          activeOpacity={0.88}
                        >
                          {isSubmitting ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <ThemedText
                              style={[
                                styles.submitButtonText,
                                {
                                  color: canSubmitPosition
                                    ? "#fff"
                                    : primaryColor,
                                },
                              ]}
                            >
                              {borrowSubmitLabel}
                            </ThemedText>
                          )}
                        </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 120,
    gap: 14,
  },
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerTitle: {
    flex: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 0,
  },
  networkPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  networkPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  disconnectLink: {
    fontSize: 13,
  },
  headerSubtitle: {
    fontSize: 12,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoText: {
    fontSize: 12,
  },
  addressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addressButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressText: {
    fontSize: 12,
    fontWeight: "700",
  },
  fieldSection: {
    gap: 8,
  },
  dropdownButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dropdownButtonDisabled: {
    opacity: 0.6,
  },
  dropdownTextStack: {
    flex: 1,
    gap: 2,
  },
  dropdownValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  dropdownDescription: {
    fontSize: 12,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillSelected: {
    borderColor: "#000",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sponsoredRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sponsoredSwitch: {
    flexDirection: "row",
    backgroundColor: "#e5e5e5",
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  sponsoredSwitchDisabled: {
    opacity: 0.5,
  },
  sponsoredSegment: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sponsoredSegmentSelected: {
    backgroundColor: "#000",
  },
  sponsoredText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111",
    textTransform: "uppercase",
  },
  sponsoredTextSelected: {
    color: "#fff",
  },
  refreshButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  metricHint: {
    fontSize: 12,
  },
  projectedCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  modalCloseButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalList: {
    flex: 1,
  },
  modalListContent: {
    padding: 20,
    gap: 10,
  },
  dropdownOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  dropdownOptionLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  dropdownOptionDescription: {
    fontSize: 12,
  },
  marketCardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  marketCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 16,
  },
  marketCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  marketCardToken: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  marketCardTokenText: {
    gap: 2,
    flexShrink: 1,
  },
  marketCardSymbol: {
    fontSize: 18,
    fontWeight: "800",
  },
  marketCardPoolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  marketCardPool: {
    fontSize: 12,
  },
  poolAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  poolAvatarText: {
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  marketSelectedPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  marketSelectedPillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  marketMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
    columnGap: 10,
  },
  marketMetricCell: {
    width: "48%",
    gap: 4,
  },
  marketMetricLabel: {
    fontSize: 12,
  },
  marketMetricValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  marketCollateralSection: {
    gap: 8,
  },
  collateralTokenRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 26,
  },
  collateralTokenAvatar: {
    borderRadius: 999,
  },
  marketCardHint: {
    fontSize: 12,
  },
  marketCardButton: {
    backgroundColor: "#dbe1ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  marketCardButtonText: {
    color: "#2c42c9",
    fontSize: 15,
    fontWeight: "700",
  },
  marketOverviewCard: {
    gap: 16,
  },
  marketSheetContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 14,
  },
  marketSheetTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  marketSheetSubtitle: {
    fontSize: 13,
  },
  marketTabRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  marketTabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  marketTabButtonActive: {
    backgroundColor: "#000",
  },
  marketTabButtonDisabled: {
    opacity: 0.55,
  },
  marketTabText: {
    fontSize: 14,
    fontWeight: "700",
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  amountSection: {
    gap: 8,
  },
  amountLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  amountRow: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 10,
    fontWeight: "600",
  },
  maxButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  maxButtonText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  submitButton: {
    width: "100%",
    marginTop: 4,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  errorText: {
    color: "#e53935",
    fontSize: 12,
    fontWeight: "600",
  },
  footerHint: {
    width: "100%",
    textAlign: "center",
    fontSize: 12,
  },
});
