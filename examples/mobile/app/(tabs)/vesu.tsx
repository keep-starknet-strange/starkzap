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
  type VesuMarketCard,
} from "@/vesu";

type VaultAction = "deposit" | "withdraw";
type PositionAction = "borrow" | "repay";
type MarketSheetTab = "supply" | "borrow";

const FEE_MODE_SPONSORED = "sponsored" as const;
const FEE_MODE_USER_PAYS = "user_pays" as const;
const EMPTY_STATE_LABEL = "—";
const SUPPORTED_VESU_CHAINS = new Set(["SN_MAIN", "SN_SEPOLIA"]);
const VESU_MARKETS_API_URL = "https://api.vesu.xyz/markets";
const VAULT_ACTIONS = ["deposit", "withdraw"] as const;
const POSITION_ACTIONS = ["borrow", "repay"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAmountInput(value: string, token: Token | null): Amount | null {
  if (!token || !value.trim()) return null;
  try {
    return Amount.parse(value.trim(), token);
  } catch {
    return null;
  }
}

function getAmountError(value: string, token: Token | null): string | null {
  if (!value.trim()) return null;
  if (!token) return "Token unavailable";
  try {
    const parsed = Amount.parse(value.trim(), token);
    if (parsed.toBase() <= 0n) return "Amount must be greater than zero";
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function amountFromBase(
  value: bigint | null | undefined,
  token: Token | null
): string {
  if (value == null || !token) return EMPTY_STATE_LABEL;
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

async function fetchVesuApiMarkets(
  chainId: ChainId
): Promise<VesuApiMarketItem[]> {
  if (!chainId.isMainnet()) return [];
  const response = await fetch(VESU_MARKETS_API_URL);
  if (!response.ok)
    throw new Error(`Vesu markets request failed (${response.status})`);
  const payload = (await response.json()) as { data?: VesuApiMarketItem[] };
  return payload.data ?? [];
}

// ---------------------------------------------------------------------------
// Inline sub-components
// ---------------------------------------------------------------------------

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
        style={{ width: size, height: size, borderRadius: size / 2 }}
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
  const visual = getVesuPoolVisual(props.poolLabel);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: visual.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ThemedText
        style={{
          color: visual.foregroundColor,
          fontSize: Math.max(8, size / 2.6),
          fontWeight: "800",
          letterSpacing: 0.2,
        }}
      >
        {visual.shortLabel}
      </ThemedText>
    </View>
  );
}

function MarketCardView(props: {
  card: VesuMarketCard;
  isSelected: boolean;
  onPress: () => void;
  width: string;
}) {
  const borderColor = useThemeColor({}, "border");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const { card, isSelected } = props;

  return (
    <TouchableOpacity
      style={[
        styles.marketCard,
        {
          borderColor: isSelected ? "#000" : borderColor,
          backgroundColor: cardBg,
          width: props.width as never,
        },
      ]}
      onPress={props.onPress}
      activeOpacity={0.92}
    >
      <View style={styles.marketCardHeader}>
        <View style={styles.tokenRow}>
          <TokenAvatar token={card.option.token} size={38} />
          <View style={{ gap: 2, flexShrink: 1 }}>
            <ThemedText style={styles.marketCardSymbol}>
              {card.option.token.symbol}
            </ThemedText>
            <View style={styles.poolRow}>
              <PoolAvatar poolLabel={card.poolLabel} />
              <ThemedText style={[styles.smallText, { color: textSecondary }]}>
                {card.poolLabel}
              </ThemedText>
            </View>
          </View>
        </View>
        {isSelected && (
          <View style={[styles.selectedPill, { backgroundColor: "#000" }]}>
            <ThemedText style={styles.selectedPillText}>Open</ThemedText>
          </View>
        )}
      </View>

      <MetricsGrid card={card} />

      <View style={{ gap: 8 }}>
        <ThemedText style={[styles.smallText, { color: textSecondary }]}>
          Collateral
        </ThemedText>
        {card.option.canBorrow ? (
          <View style={styles.collateralRow}>
            {card.collateralTokens.length > 0 ? (
              card.collateralTokens.map((token, i) => (
                <View
                  key={`${card.key}:${token.address}`}
                  style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 999 }}
                >
                  <TokenAvatar token={token} size={24} />
                </View>
              ))
            ) : (
              <ThemedText style={[styles.smallText, { color: textSecondary }]}>
                Same-pool collateral metadata unavailable
              </ThemedText>
            )}
          </View>
        ) : (
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            Borrowing of {card.option.token.symbol} not enabled
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
}

function MetricsGrid(props: { card: VesuMarketCard }) {
  const textSecondary = useThemeColor({}, "textSecondary");
  const { card } = props;
  const metrics = [
    ["Total supplied", card.totalSuppliedLabel],
    ["Total borrowed", card.totalBorrowedLabel],
    ["Supply APR", card.supplyAprLabel],
    ["Borrow APR", card.borrowAprLabel],
  ] as const;

  return (
    <View style={styles.metricsGrid}>
      {metrics.map(([label, value]) => (
        <View key={label} style={styles.metricCell}>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {label}
          </ThemedText>
          <ThemedText style={styles.metricValue}>{value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function PositionHealthCard(props: {
  currentStatus: string;
  health: LendingHealth | null;
  projectedHealth: LendingHealth | null;
  projectedStatus: string;
  collateralAmount: string;
  debtAmount: string;
  isRefreshing: boolean;
  positionError: string | null;
  onRefresh: () => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const backgroundColor = useThemeColor({}, "background");

  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText style={styles.cardTitle}>Position Health</ThemedText>
        <TouchableOpacity
          onPress={props.onRefresh}
          style={[styles.refreshButton, { backgroundColor: borderColor }]}
          disabled={props.isRefreshing}
          activeOpacity={0.88}
        >
          {props.isRefreshing ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Ionicons name="refresh" size={14} color={primaryColor} />
          )}
        </TouchableOpacity>
      </View>

      {props.positionError && (
        <ThemedText style={styles.errorText}>{props.positionError}</ThemedText>
      )}

      <View style={styles.metricsRowPair}>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            Status
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {props.currentStatus}
          </ThemedText>
        </View>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            LTV
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {formatVesuLtv(props.health)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metricsRowPair}>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            Collateral
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {props.collateralAmount}
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {formatVesuUsdValue(props.health?.collateralValue)}
          </ThemedText>
        </View>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            Debt
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {props.debtAmount}
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {formatVesuUsdValue(props.health?.debtValue)}
          </ThemedText>
        </View>
      </View>

      {props.projectedHealth && (
        <View style={[styles.projectedCard, { backgroundColor, borderColor }]}>
          <ThemedText style={styles.cardTitle}>
            Projected After Preview
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {props.projectedStatus} · {formatVesuLtv(props.projectedHealth)}
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            Collateral{" "}
            {formatVesuUsdValue(props.projectedHealth.collateralValue)}
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            Debt {formatVesuUsdValue(props.projectedHealth.debtValue)}
          </ThemedText>
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Amount field with optional MAX button
// ---------------------------------------------------------------------------

function AmountField(props: {
  label: string;
  hint: string;
  value: string;
  error: string | null;
  onChangeText: (v: string) => void;
  maxValue?: string;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.amountLabelRow}>
        <ThemedText style={[styles.label, { color: textSecondary }]}>
          {props.label}
        </ThemedText>
        <ThemedText style={[styles.smallText, { color: textSecondary }]}>
          {props.hint}
        </ThemedText>
      </View>
      <View style={[styles.amountRow, { borderColor }]}>
        <TextInput
          style={[styles.amountInput, { color: primaryColor }]}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder="0.0"
          placeholderTextColor={textSecondary}
          keyboardType="decimal-pad"
        />
        {!!props.maxValue && (
          <TouchableOpacity
            style={[styles.maxButton, { backgroundColor: borderColor }]}
            onPress={() => props.onChangeText(props.maxValue!)}
            activeOpacity={0.88}
          >
            <ThemedText style={[styles.maxButtonText, { color: primaryColor }]}>
              MAX
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {props.error && (
        <ThemedText style={styles.errorText}>{props.error}</ThemedText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

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
  const [apiMarkets, setApiMarkets] = useState<VesuApiMarketItem[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Selection state
  const [selectedVaultAssetKey, setSelectedVaultAssetKey] = useState<
    string | null
  >(null);
  const [selectedCollateralAssetKey, setSelectedCollateralAssetKey] = useState<
    string | null
  >(null);

  // Position state
  const [position, setPosition] = useState<LendingPosition | null>(null);
  const [health, setHealth] = useState<LendingHealth | null>(null);
  const [projectedHealth, setProjectedHealth] = useState<LendingHealth | null>(
    null
  );
  const [isRefreshingPosition, setIsRefreshingPosition] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Form state — consolidated for borrow/repay
  const [vaultAction, setVaultAction] = useState<VaultAction>("deposit");
  const [positionAction, setPositionAction] =
    useState<PositionAction>("borrow");
  const [vaultAmount, setVaultAmount] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
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
  const columnWidth =
    marketColumns === 1 ? "100%" : marketColumns === 2 ? "48.5%" : "32%";
  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const resetDraftState = useCallback(() => {
    setVaultAmount("");
    setDebtAmount("");
    setCollateralAmount("");
    setProjectedHealth(null);
    setQuoteError(null);
  }, []);

  // Reset form amounts when switching borrow/repay
  useEffect(() => {
    setDebtAmount("");
    setCollateralAmount("");
    setProjectedHealth(null);
    setQuoteError(null);
  }, [positionAction]);

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

  // Memo: selected assets
  const selectedVaultAsset = useMemo(
    () =>
      selectedVaultAssetKey
        ? (assetOptions.find((o) => o.key === selectedVaultAssetKey) ?? null)
        : null,
    [assetOptions, selectedVaultAssetKey]
  );
  const selectedDebtAsset = useMemo(
    () => (selectedVaultAsset?.canBorrow ? selectedVaultAsset : null),
    [selectedVaultAsset]
  );
  const collateralOptions = useMemo(
    () => getAvailableVesuCollateralAssets(assetOptions, selectedDebtAsset),
    [assetOptions, selectedDebtAsset]
  );
  const selectedCollateralAsset = useMemo(
    () =>
      collateralOptions.find((o) => o.key === selectedCollateralAssetKey) ??
      getDefaultVesuCollateralAsset(collateralOptions, selectedDebtAsset),
    [collateralOptions, selectedCollateralAssetKey, selectedDebtAsset]
  );
  const selectedCollateralToken = selectedCollateralAsset?.token ?? null;
  const selectedMarketCard = useMemo(
    () =>
      selectedVaultAssetKey
        ? (marketCards.find((c) => c.key === selectedVaultAssetKey) ?? null)
        : null,
    [marketCards, selectedVaultAssetKey]
  );

  // Balances
  const vaultBalance = selectedVaultAsset
    ? getBalance(selectedVaultAsset.token)
    : null;
  const collateralWalletBalance = selectedCollateralToken
    ? getBalance(selectedCollateralToken)
    : null;
  const debtWalletBalance = selectedDebtAsset
    ? getBalance(selectedDebtAsset.token)
    : null;

  // Errors
  const vaultAmountError = getAmountError(
    vaultAmount,
    selectedVaultAsset?.token ?? null
  );
  const debtAmountError = getAmountError(
    debtAmount,
    selectedDebtAsset?.token ?? null
  );
  const collateralAmountError = getAmountError(
    collateralAmount,
    selectedCollateralToken
  );

  // Position display values
  const currentStatus = getVesuHealthStatus(health, position);
  const projectedStatus = getVesuHealthStatus(projectedHealth, position);
  const currentCollateralAmount = amountFromBase(
    position?.collateralAmount,
    selectedCollateralToken
  );
  const currentDebtAmount = amountFromBase(
    position?.debtAmount,
    selectedDebtAsset?.token ?? null
  );

  const collateralDropdownOptions = useMemo<DropdownOption[]>(
    () =>
      collateralOptions.map((o) => ({
        key: o.key,
        label: o.token.symbol,
        description: describeCollateralOption(o),
      })),
    [collateralOptions]
  );

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
      const [nextMarkets, nextApiMarkets] = await Promise.all([
        wallet.lending().getMarkets({ provider: VESU_PROVIDER_ID }),
        fetchVesuApiMarkets(chainId).catch((e) => {
          addLog(
            `Vesu stats fetch failed: ${e instanceof Error ? e.message : String(e)}`
          );
          return [];
        }),
      ]);
      setMarkets(nextMarkets);
      setApiMarkets(nextApiMarkets);
      addLog(
        nextMarkets.length
          ? `Loaded ${nextMarkets.length} Vesu SDK markets and ${nextApiMarkets.length} Vesu stats entries`
          : "Vesu market discovery returned no metadata; using fallback assets"
      );
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
    if (!wallet) return;
    setProjectedHealth(null);
    setQuoteError(null);
    await Promise.all([
      fetchBalances(wallet, chainId),
      loadMarkets(),
      refreshPosition(),
    ]);
  }, [chainId, fetchBalances, loadMarkets, refreshPosition, wallet]);

  // Effects
  useEffect(() => {
    if (wallet) void fetchBalances(wallet, chainId);
  }, [chainId, fetchBalances, wallet]);
  useEffect(() => {
    if (wallet) void loadMarkets();
  }, [loadMarkets, wallet]);
  useEffect(() => {
    if (wallet) void refreshPosition();
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
    collateralAmount,
    debtAmount,
  ]);
  useEffect(() => {
    if (marketSheetTab === "borrow" && !selectedMarketCard?.option.canBorrow)
      setMarketSheetTab("supply");
  }, [marketSheetTab, selectedMarketCard]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handlePreview = useCallback(async () => {
    if (
      !wallet ||
      !selectedDebtAsset ||
      !selectedCollateralToken ||
      !isVesuSupported
    )
      return;

    const commonRequest = {
      provider: VESU_PROVIDER_ID,
      ...(selectedDebtAsset.poolAddress
        ? { poolAddress: selectedDebtAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
    };

    const parsedDebt = parseAmountInput(debtAmount, selectedDebtAsset.token);
    const parsedCollateral = parseAmountInput(
      collateralAmount,
      selectedCollateralToken
    );
    if (!parsedDebt) {
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
                  amount: parsedDebt,
                  ...(parsedCollateral
                    ? { collateralAmount: parsedCollateral }
                    : {}),
                },
              }
            : {
                action: "repay",
                request: {
                  ...commonRequest,
                  amount: parsedDebt,
                  ...(parsedCollateral
                    ? {
                        collateralAmount: parsedCollateral,
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
        addLog(`Vesu ${positionAction} preview succeeded`);
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
    canUseSponsored,
    collateralAmount,
    debtAmount,
    isVesuSupported,
    positionAction,
    selectedCollateralToken,
    selectedDebtAsset,
    useSponsored,
    wallet,
  ]);

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
    )
      return;

    const commonRequest = {
      provider: VESU_PROVIDER_ID,
      ...(selectedDebtAsset.poolAddress
        ? { poolAddress: selectedDebtAsset.poolAddress }
        : {}),
      collateralToken: selectedCollateralToken,
      debtToken: selectedDebtAsset.token,
    };
    const parsedDebt = parseAmountInput(debtAmount, selectedDebtAsset.token);
    const parsedCollateral = parseAmountInput(
      collateralAmount,
      selectedCollateralToken
    );
    if (!parsedDebt) {
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
                amount: parsedDebt,
                ...(parsedCollateral
                  ? { collateralAmount: parsedCollateral }
                  : {}),
              },
              options
            )
          : await wallet.lending().repay(
              {
                ...commonRequest,
                amount: parsedDebt,
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
            : "Repaying Vesu Debt",
        pendingSubtitle:
          positionAction === "borrow"
            ? `Borrowing ${parsedDebt.toUnit()} ${selectedDebtAsset.token.symbol}`
            : `Repaying ${parsedDebt.toUnit()} ${selectedDebtAsset.token.symbol}`,
        successTitle:
          positionAction === "borrow"
            ? "Vesu Borrow Complete"
            : "Vesu Repay Complete",
        successSubtitle:
          positionAction === "borrow"
            ? `Borrowed ${parsedDebt.toUnit()} ${selectedDebtAsset.token.symbol}`
            : `Repaid ${parsedDebt.toUnit()} ${selectedDebtAsset.token.symbol}`,
      });
      setDebtAmount("");
      setCollateralAmount("");
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
    canUseSponsored,
    chainId,
    collateralAmount,
    debtAmount,
    fetchBalances,
    isVesuSupported,
    loadMarkets,
    positionAction,
    refreshPosition,
    selectedCollateralToken,
    selectedDebtAsset,
    trackTransaction,
    useSponsored,
    wallet,
  ]);

  if (!wallet) return null;

  // -----------------------------------------------------------------------
  // Validation flags
  // -----------------------------------------------------------------------
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
    !!debtAmount.trim() &&
    !debtAmountError &&
    !collateralAmountError &&
    (!borrowRequiresCollateralInput || !!collateralAmount.trim());
  const canSubmitPosition =
    !!selectedDebtAsset &&
    !!selectedCollateralToken &&
    !isSubmitting &&
    !isRefreshingPosition &&
    !!debtAmount.trim() &&
    !debtAmountError &&
    !collateralAmountError &&
    (!borrowRequiresCollateralInput || !!collateralAmount.trim());
  const borrowSubmitLabel =
    positionAction === "borrow"
      ? borrowRequiresCollateralInput
        ? "Deposit Collateral & Borrow"
        : "Submit Borrow"
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

                {/* Supply / Borrow tab toggle */}
                <View style={[styles.tabRow, { backgroundColor, borderColor }]}>
                  {(["supply", "borrow"] as const).map((tab) => {
                    const isActive = marketSheetTab === tab;
                    const isDisabled =
                      tab === "borrow" && !selectedMarketCard.option.canBorrow;
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
                          ? `Wallet ${vaultBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}`
                          : "Use Withdraw Max to redeem your full Vesu position"
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
                {marketSheetTab === "borrow" &&
                  selectedMarketCard.option.canBorrow && (
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
                          projectedHealth={projectedHealth}
                          projectedStatus={projectedStatus}
                          collateralAmount={currentCollateralAmount}
                          debtAmount={currentDebtAmount}
                          isRefreshing={isRefreshingPosition}
                          positionError={positionError}
                          onRefresh={() => void refreshPosition()}
                        />
                      </View>

                      {borrowRequiresCollateralInput && (
                        <View
                          style={[
                            styles.noticeCard,
                            { backgroundColor, borderColor },
                          ]}
                        >
                          <ThemedText
                            style={{ fontSize: 14, fontWeight: "700" }}
                          >
                            Deposit collateral first
                          </ThemedText>
                          <ThemedText
                            style={[
                              { fontSize: 13, lineHeight: 18 },
                              { color: textSecondary },
                            ]}
                          >
                            This market needs collateral before you can borrow.
                            Pick a same-pool collateral asset below.
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

                        <ActionPills
                          actions={POSITION_ACTIONS}
                          labels={{ borrow: "Borrow", repay: "Repay" }}
                          selected={positionAction}
                          onSelect={setPositionAction}
                        />

                        <AmountField
                          label={
                            positionAction === "borrow"
                              ? "Collateral to Add"
                              : "Collateral to Withdraw"
                          }
                          hint={
                            positionAction === "borrow"
                              ? `Wallet ${collateralWalletBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}`
                              : `Position ${amountFromBase(position?.collateralAmount, selectedCollateralToken)}`
                          }
                          value={collateralAmount}
                          error={collateralAmountError}
                          onChangeText={setCollateralAmount}
                          maxValue={
                            positionAction === "borrow"
                              ? collateralWalletBalance?.toUnit()
                              : selectedCollateralToken &&
                                  position?.collateralAmount != null
                                ? Amount.fromRaw(
                                    position.collateralAmount,
                                    selectedCollateralToken
                                  ).toUnit()
                                : undefined
                          }
                        />

                        <AmountField
                          label={
                            positionAction === "borrow"
                              ? "Debt to Borrow"
                              : "Debt to Repay"
                          }
                          hint={`Wallet ${debtWalletBalance?.toFormatted(true) ?? EMPTY_STATE_LABEL}`}
                          value={debtAmount}
                          error={debtAmountError}
                          onChangeText={setDebtAmount}
                          maxValue={
                            positionAction === "repay"
                              ? debtWalletBalance?.toUnit()
                              : undefined
                          }
                        />

                        {quoteError && (
                          <ThemedText style={styles.errorText}>
                            {quoteError}
                          </ThemedText>
                        )}

                        <SecondaryButton
                          label="Preview Health"
                          enabled={canPreviewPosition}
                          loading={isQuoting}
                          onPress={() => void handlePreview()}
                        />
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

// ---------------------------------------------------------------------------
// Button components
// ---------------------------------------------------------------------------

function SubmitButton(props: {
  label: string;
  enabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  return (
    <TouchableOpacity
      style={[
        styles.submitButton,
        props.enabled
          ? { backgroundColor: "#000" }
          : { backgroundColor: borderColor },
        !props.enabled && { opacity: 0.65 },
      ]}
      onPress={props.onPress}
      disabled={!props.enabled}
      activeOpacity={0.88}
    >
      {props.loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <ThemedText
          style={[
            styles.submitButtonText,
            { color: props.enabled ? "#fff" : primaryColor },
          ]}
        >
          {props.label}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton(props: {
  label: string;
  enabled: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const backgroundColor = useThemeColor({}, "background");
  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        { borderColor, backgroundColor },
        !props.enabled && { opacity: 0.65 },
      ]}
      onPress={props.onPress}
      disabled={!props.enabled}
      activeOpacity={0.88}
    >
      {props.loading ? (
        <ActivityIndicator size="small" color={primaryColor} />
      ) : (
        <ThemedText
          style={[styles.secondaryButtonText, { color: primaryColor }]}
        >
          {props.label}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  networkPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  networkPillText: { fontSize: 11, fontWeight: "600" },
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
  cardTitle: { fontSize: 16, fontWeight: "700" },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  smallText: { fontSize: 12 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  tokenRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  poolRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  collateralRow: { flexDirection: "row", alignItems: "center", minHeight: 26 },
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
  sponsoredSegment: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sponsoredSegmentSelected: { backgroundColor: "#000" },
  sponsoredText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111",
    textTransform: "uppercase",
  },
  refreshButton: {
    width: 28,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  metricsRowPair: { flexDirection: "row", gap: 10 },
  metricCard: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  metricValueBold: { fontSize: 16, fontWeight: "700" },
  projectedCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
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
  maxButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
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
  submitButtonText: { fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
  errorText: { color: "#e53935", fontSize: 12, fontWeight: "600" },
  footerHint: { width: "100%", textAlign: "center", fontSize: 12 },
  modalContainer: { flex: 1 },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  closeButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  closeButtonText: { fontSize: 12, fontWeight: "600" },
  marketCardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  marketCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 },
  marketCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  marketCardSymbol: { fontSize: 18, fontWeight: "800" },
  selectedPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedPillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
    columnGap: 10,
  },
  metricCell: { width: "48%", gap: 4 },
  metricValue: { fontSize: 16, fontWeight: "700" },
  marketCardButton: {
    backgroundColor: "#dbe1ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  marketCardButtonText: { color: "#2c42c9", fontSize: 15, fontWeight: "700" },
  tabRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: { backgroundColor: "#000" },
  tabText: { fontSize: 14, fontWeight: "700" },
  noticeCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
});
