import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePrivy } from "@privy-io/expo";

import { LogsFAB } from "@/components/LogsFAB";
import { ThemedText } from "@/components/themed-text";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  getStrkToken,
  getTokensForNetwork,
  getWbtcToken,
  useBalancesStore,
} from "@/stores/balances";
import { NETWORKS, useWalletStore } from "@/stores/wallet";
import {
  dedupeAndSortTokens,
  getRecommendedOutputToken,
  getSwapProviderLabel,
  swapProviders,
} from "@/swaps";
import { getDcaProviders } from "@/dca";
import {
  Amount,
  type ChainId,
  type DcaProvider,
  type DcaOrder,
  type SwapProvider,
  type Token,
} from "@starkzap/native";

const WBTC_LOGO_FALLBACK =
  "https://altcoinsbox.com/wp-content/uploads/2023/01/wbtc-wrapped-bitcoin-logo.png";
const DCA_ORDER_PAGE_SIZE = 6;
const DCA_FREQUENCY_OPTIONS = [
  { value: "PT12H", label: "12h" },
  { value: "P1D", label: "Daily" },
  { value: "P3D", label: "3d" },
  { value: "P1W", label: "Weekly" },
] as const;

type ScreenMode = "swap" | "dca";
type TokenPickerMode = "swap-from" | "swap-to" | "dca-from" | "dca-to";
type DcaFrequencyValue = (typeof DCA_FREQUENCY_OPTIONS)[number]["value"];

interface DcaPreviewState {
  amountOutBase: bigint;
  priceImpactBps?: bigint | null;
  providerId: string;
  routeCallCount?: number;
}

function cropAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-5)}`;
}

function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? "https://sepolia.voyager.online/tx"
      : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}

function getPreferredDcaPreviewProviderId(
  providers: readonly SwapProvider[]
): string | null {
  if (!providers.length) {
    return null;
  }
  return (
    providers.find((provider) => provider.id === "ekubo")?.id ??
    providers[0]!.id
  );
}

function getPreferredDcaProviderId(
  providers: readonly DcaProvider[]
): string | null {
  if (!providers.length) {
    return null;
  }
  return (
    providers.find((provider) => provider.id === "avnu")?.id ?? providers[0]!.id
  );
}

function getDcaProviderLabel(providerId: string): string {
  return providerId.toUpperCase();
}

function getCuratedDcaTokens(
  tokens: readonly Token[],
  chainId: ChainId
): Token[] {
  const preferredSymbols =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? ["STRK", "USDC.e", "USDC", "ETH", "WBTC"]
      : ["STRK", "USDC", "USDT", "DAI", "ETH", "WBTC"];

  const selected: Token[] = [];
  for (const symbol of preferredSymbols) {
    const token = tokens.find((item) => item.symbol === symbol);
    if (
      token &&
      !selected.some((current) => current.address === token.address)
    ) {
      selected.push(token);
    }
  }

  if (selected.length >= 2) {
    return selected;
  }

  return tokens.slice(0, Math.min(tokens.length, 6));
}

function getDefaultDcaPair(
  tokens: readonly Token[],
  chainId: ChainId
): { buyToken: Token; sellToken: Token } {
  const fallback = tokens[0];
  if (!fallback) {
    throw new Error("No DCA tokens available for this network");
  }

  const sellToken = tokens.find((token) => token.symbol === "STRK") ?? fallback;
  const preferredOutputSymbols =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? ["USDC.e", "USDC", "ETH"]
      : ["USDC", "USDT", "DAI", "ETH"];

  for (const symbol of preferredOutputSymbols) {
    const buyToken = tokens.find((token) => token.symbol === symbol);
    if (buyToken && buyToken.address !== sellToken.address) {
      return { buyToken, sellToken };
    }
  }

  const buyToken =
    tokens.find((token) => token.address !== sellToken.address) ?? sellToken;
  return { buyToken, sellToken };
}

function getDcaFrequencyLabel(frequency: string): string {
  if (frequency === "CONTINUOUS") {
    return "Continuous";
  }
  return (
    DCA_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ??
    frequency
  );
}

function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTokenAmount(amountBase: bigint, token: Token | null): string {
  if (!token) {
    return amountBase.toString();
  }
  return Amount.fromRaw(amountBase, token.decimals, token.symbol).toFormatted(
    true
  );
}

function buildDcaCancelInput(order: DcaOrder) {
  return order.providerId === "ekubo"
    ? { provider: order.providerId, orderId: order.id }
    : { provider: order.providerId, orderAddress: order.orderAddress };
}

function TinyTokenLogo({ token }: { token: Token }) {
  const [imageError, setImageError] = useState(false);
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "border");
  const useFallback = !token.metadata?.logoUrl || imageError;

  if (token.symbol === "WBTC" && useFallback) {
    return (
      <Image
        source={{ uri: WBTC_LOGO_FALLBACK }}
        style={styles.tinyLogo}
        onError={() => setImageError(true)}
      />
    );
  }

  if (useFallback) {
    return (
      <View
        style={[
          styles.tinyLogo,
          styles.tinyLogoPlaceholder,
          { backgroundColor: borderColor },
        ]}
      >
        <ThemedText style={[styles.tinyLogoText, { color: primaryColor }]}>
          {token.symbol.charAt(0)}
        </ThemedText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: token.metadata!.logoUrl!.toString() }}
      style={styles.tinyLogo}
      onError={() => setImageError(true)}
    />
  );
}

export default function SwapScreen() {
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
    isLoading: isLoadingBalances,
    clearBalances,
  } = useBalancesStore();

  const allTokens = useMemo(() => getTokensForNetwork(chainId), [chainId]);
  const strkToken = useMemo(() => getStrkToken(chainId), [chainId]);
  const wbtcToken = useMemo(() => getWbtcToken(chainId), [chainId]);
  const availableIntegrations = useMemo(() => {
    const registeredProviders = wallet
      ? wallet
          .listSwapProviders()
          .map((providerId) => wallet.getSwapProvider(providerId))
      : swapProviders;

    return registeredProviders.filter(
      (provider, index, providers) =>
        provider.supportsChain(chainId) &&
        providers.findIndex((candidate) => candidate.id === provider.id) ===
          index
    );
  }, [chainId, wallet]);
  const availableDcaProviders = useMemo(() => {
    const registeredProviders = wallet
      ? wallet
          .dca()
          .listProviders()
          .map((providerId) => wallet.dca().getDcaProvider(providerId))
      : getDcaProviders();

    return registeredProviders.filter(
      (provider, index, providers) =>
        provider.supportsChain(chainId) &&
        providers.findIndex((candidate) => candidate.id === provider.id) ===
          index
    );
  }, [chainId, wallet]);
  const integrationTokens = useMemo(
    () => dedupeAndSortTokens(allTokens),
    [allTokens]
  );
  const preferredOutputToken = useMemo(
    () =>
      getRecommendedOutputToken({
        chainId,
        tokenIn: strkToken,
        tokens: integrationTokens,
      }),
    [chainId, integrationTokens, strkToken]
  );
  const primaryTokens = useMemo(() => {
    const eth = integrationTokens.find((token) => token.symbol === "ETH");
    const fallbackToToken =
      preferredOutputToken ??
      integrationTokens.find((token) => token.address !== strkToken.address) ??
      strkToken;
    const ordered = [strkToken, wbtcToken, fallbackToToken, eth].filter(
      (token): token is Token => token != null
    );
    return ordered.filter(
      (token, index, items) =>
        items.findIndex((candidate) => candidate.address === token.address) ===
        index
    );
  }, [integrationTokens, preferredOutputToken, strkToken, wbtcToken]);
  const tokenPickerTokens = useMemo(() => {
    const sorted = [...integrationTokens].sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    );
    const primaryAddresses = new Set(
      primaryTokens.map((token) => token.address)
    );
    return [
      ...primaryTokens,
      ...sorted.filter((token) => !primaryAddresses.has(token.address)),
    ];
  }, [integrationTokens, primaryTokens]);
  const dcaTokens = useMemo(
    () => getCuratedDcaTokens(integrationTokens, chainId),
    [chainId, integrationTokens]
  );
  const dcaDefaultPair = useMemo(
    () => getDefaultDcaPair(dcaTokens, chainId),
    [chainId, dcaTokens]
  );
  const tokenMetadataByAddress = useMemo(
    () => new Map(allTokens.map((token) => [token.address, token])),
    [allTokens]
  );

  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const [screenMode, setScreenMode] = useState<ScreenMode>("swap");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | null
  >(null);
  const [selectedDcaProviderId, setSelectedDcaProviderId] = useState<
    string | null
  >(null);
  const [selectedDcaPreviewProviderId, setSelectedDcaPreviewProviderId] =
    useState<string | null>(null);
  const [fromToken, setFromToken] = useState<Token>(strkToken);
  const [toToken, setToToken] = useState<Token>(
    preferredOutputToken ??
      primaryTokens.find((token) => token.address !== strkToken.address) ??
      strkToken
  );
  const [amount, setAmount] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dcaSellToken, setDcaSellToken] = useState<Token>(
    dcaDefaultPair.sellToken
  );
  const [dcaBuyToken, setDcaBuyToken] = useState<Token>(
    dcaDefaultPair.buyToken
  );
  const [dcaTotalAmount, setDcaTotalAmount] = useState("");
  const [dcaCycleAmount, setDcaCycleAmount] = useState("");
  const [dcaFrequency, setDcaFrequency] = useState<DcaFrequencyValue>("P1D");
  const [dcaPreview, setDcaPreview] = useState<DcaPreviewState | null>(null);
  const [dcaError, setDcaError] = useState<string | null>(null);
  const [dcaOrdersError, setDcaOrdersError] = useState<string | null>(null);
  const [dcaOrders, setDcaOrders] = useState<DcaOrder[]>([]);
  const [isDcaPreviewing, setIsDcaPreviewing] = useState(false);
  const [isDcaSubmitting, setIsDcaSubmitting] = useState(false);
  const [isRefreshingDcaOrders, setIsRefreshingDcaOrders] = useState(false);
  const [cancellingDcaOrderId, setCancellingDcaOrderId] = useState<
    string | null
  >(null);
  const [useSponsored, setUseSponsored] = useState(
    preferSponsored && Boolean(paymasterNodeUrl)
  );
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<TokenPickerMode>("swap-from");
  const [tokenSearch, setTokenSearch] = useState("");

  useEffect(() => {
    if (!availableIntegrations.length) {
      setSelectedIntegrationId(null);
      return;
    }

    if (
      !selectedIntegrationId ||
      !availableIntegrations.some(
        (integration) => integration.id === selectedIntegrationId
      )
    ) {
      setSelectedIntegrationId(availableIntegrations[0]!.id);
    }
  }, [availableIntegrations, selectedIntegrationId]);

  useEffect(() => {
    if (!availableDcaProviders.length) {
      setSelectedDcaProviderId(null);
      return;
    }

    if (
      !selectedDcaProviderId ||
      !availableDcaProviders.some(
        (provider) => provider.id === selectedDcaProviderId
      )
    ) {
      setSelectedDcaProviderId(
        getPreferredDcaProviderId(availableDcaProviders)
      );
    }
  }, [availableDcaProviders, selectedDcaProviderId]);

  useEffect(() => {
    const preferredPreviewProviderId = getPreferredDcaPreviewProviderId(
      availableIntegrations
    );
    if (!preferredPreviewProviderId) {
      setSelectedDcaPreviewProviderId(null);
      return;
    }

    if (
      !selectedDcaPreviewProviderId ||
      !availableIntegrations.some(
        (integration) => integration.id === selectedDcaPreviewProviderId
      )
    ) {
      setSelectedDcaPreviewProviderId(preferredPreviewProviderId);
    }
  }, [availableIntegrations, selectedDcaPreviewProviderId]);

  const selectedIntegration = useMemo<SwapProvider | null>(() => {
    if (!availableIntegrations.length) {
      return null;
    }
    return (
      availableIntegrations.find(
        (integration) => integration.id === selectedIntegrationId
      ) ?? availableIntegrations[0]!
    );
  }, [availableIntegrations, selectedIntegrationId]);

  const selectedDcaPreviewProvider = useMemo<SwapProvider | null>(() => {
    if (!availableIntegrations.length || !selectedDcaPreviewProviderId) {
      return null;
    }
    return (
      availableIntegrations.find(
        (integration) => integration.id === selectedDcaPreviewProviderId
      ) ?? null
    );
  }, [availableIntegrations, selectedDcaPreviewProviderId]);
  const selectedDcaProvider = useMemo<DcaProvider | null>(() => {
    if (!availableDcaProviders.length || !selectedDcaProviderId) {
      return null;
    }
    return (
      availableDcaProviders.find(
        (provider) => provider.id === selectedDcaProviderId
      ) ?? null
    );
  }, [availableDcaProviders, selectedDcaProviderId]);

  useEffect(() => {
    if (!integrationTokens.length) {
      return;
    }

    const fallbackToToken =
      preferredOutputToken && preferredOutputToken.address !== strkToken.address
        ? preferredOutputToken
        : (primaryTokens.find((token) => token.address !== strkToken.address) ??
          strkToken);

    setFromToken((current) => {
      const currentExists = integrationTokens.some(
        (token) => token.address === current.address
      );
      return currentExists ? current : strkToken;
    });

    setToToken((current) => {
      const currentExists = integrationTokens.some(
        (token) => token.address === current.address
      );
      if (currentExists && current.address !== strkToken.address) {
        return current;
      }
      return fallbackToToken;
    });
  }, [integrationTokens, preferredOutputToken, primaryTokens, strkToken]);

  useEffect(() => {
    if (!dcaTokens.length) {
      return;
    }

    setDcaSellToken((current) => {
      const currentExists = dcaTokens.some(
        (token) => token.address === current.address
      );
      return currentExists ? current : dcaDefaultPair.sellToken;
    });

    setDcaBuyToken((current) => {
      const currentExists = dcaTokens.some(
        (token) => token.address === current.address
      );
      if (
        currentExists &&
        current.address !== dcaDefaultPair.sellToken.address
      ) {
        return current;
      }
      return dcaDefaultPair.buyToken;
    });
  }, [dcaDefaultPair.buyToken, dcaDefaultPair.sellToken, dcaTokens]);

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");

  const fromBalance = getBalance(fromToken);
  const amountNumber = parseFloat(amount) || 0;
  const fromBalanceNumber = parseFloat(fromBalance?.toUnit() ?? "0") || 0;
  const exceedsBalance =
    amountNumber > 0 && !!fromBalance && amountNumber > fromBalanceNumber;
  const sameToken = fromToken.address === toToken.address;
  const amountParseError = useMemo(() => {
    if (!amount.trim()) {
      return null;
    }
    try {
      const parsedAmount = Amount.parse(amount, fromToken);
      if (parsedAmount.toBase() <= 0n) {
        return "Amount must be greater than zero";
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [amount, fromToken]);
  const amountIn = useMemo(() => {
    if (!amount.trim() || amountParseError) {
      return null;
    }
    try {
      return Amount.parse(amount, fromToken);
    } catch {
      return null;
    }
  }, [amount, amountParseError, fromToken]);

  const dcaSellBalance = getBalance(dcaSellToken);
  const dcaTotalAmountNumber = parseFloat(dcaTotalAmount) || 0;
  const dcaSellBalanceNumber = parseFloat(dcaSellBalance?.toUnit() ?? "0") || 0;
  const dcaExceedsBalance =
    dcaTotalAmountNumber > 0 &&
    !!dcaSellBalance &&
    dcaTotalAmountNumber > dcaSellBalanceNumber;
  const dcaSameToken = dcaSellToken.address === dcaBuyToken.address;
  const dcaTotalAmountError = useMemo(() => {
    if (!dcaTotalAmount.trim()) {
      return null;
    }
    try {
      const parsedAmount = Amount.parse(dcaTotalAmount, dcaSellToken);
      if (parsedAmount.toBase() <= 0n) {
        return "Total amount must be greater than zero";
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [dcaSellToken, dcaTotalAmount]);
  const parsedDcaTotalAmount = useMemo(() => {
    if (!dcaTotalAmount.trim() || dcaTotalAmountError) {
      return null;
    }
    try {
      return Amount.parse(dcaTotalAmount, dcaSellToken);
    } catch {
      return null;
    }
  }, [dcaSellToken, dcaTotalAmount, dcaTotalAmountError]);
  const dcaCycleAmountError = useMemo(() => {
    if (!dcaCycleAmount.trim()) {
      return null;
    }
    try {
      const parsedAmount = Amount.parse(dcaCycleAmount, dcaSellToken);
      if (parsedAmount.toBase() <= 0n) {
        return "Per-cycle amount must be greater than zero";
      }
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [dcaCycleAmount, dcaSellToken]);
  const parsedDcaCycleAmount = useMemo(() => {
    if (!dcaCycleAmount.trim() || dcaCycleAmountError) {
      return null;
    }
    try {
      return Amount.parse(dcaCycleAmount, dcaSellToken);
    } catch {
      return null;
    }
  }, [dcaCycleAmount, dcaCycleAmountError, dcaSellToken]);
  const dcaCycleExceedsTotal =
    !!parsedDcaTotalAmount &&
    !!parsedDcaCycleAmount &&
    parsedDcaCycleAmount.toBase() > parsedDcaTotalAmount.toBase();

  const canUseSponsored = Boolean(paymasterNodeUrl);
  const canSubmit =
    !!wallet &&
    !!selectedIntegration &&
    !isSubmitting &&
    !!amountIn &&
    !sameToken &&
    !exceedsBalance &&
    !amountParseError;
  const canPreviewDca =
    !!wallet &&
    !!selectedDcaProvider &&
    !!selectedDcaPreviewProvider &&
    !!parsedDcaCycleAmount &&
    !isDcaPreviewing &&
    !dcaSameToken &&
    !dcaCycleAmountError;
  const canCreateDca =
    !!wallet &&
    !!selectedDcaProvider &&
    !isDcaSubmitting &&
    !!parsedDcaTotalAmount &&
    !!parsedDcaCycleAmount &&
    !dcaSameToken &&
    !dcaExceedsBalance &&
    !dcaCycleExceedsTotal &&
    !dcaTotalAmountError &&
    !dcaCycleAmountError;
  const dcaPreviewProviderLabel = useMemo(() => {
    if (!dcaPreview) {
      return null;
    }

    const matchingProvider = availableIntegrations.find(
      (provider) => provider.id === dcaPreview.providerId
    );
    if (matchingProvider) {
      return getSwapProviderLabel(matchingProvider);
    }

    return dcaPreview.providerId.toUpperCase();
  }, [availableIntegrations, dcaPreview]);
  const dcaBackendLabel = useMemo(() => {
    if (!selectedDcaProvider) {
      return null;
    }
    return getDcaProviderLabel(selectedDcaProvider.id);
  }, [selectedDcaProvider]);

  const clearTokenPicker = useCallback(() => {
    setTokenSearch("");
    setShowTokenPicker(false);
  }, []);

  const activePickerTokens = useMemo(
    () => (pickerMode.startsWith("dca") ? dcaTokens : tokenPickerTokens),
    [dcaTokens, pickerMode, tokenPickerTokens]
  );
  const filteredTokenPickerTokens = useMemo(() => {
    const query = tokenSearch.trim().toLowerCase();
    if (!query) {
      return activePickerTokens;
    }
    return activePickerTokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query)
    );
  }, [activePickerTokens, tokenSearch]);

  const refreshDcaOrders = useCallback(
    async (silent = false) => {
      if (!wallet) {
        return;
      }

      setIsRefreshingDcaOrders(true);
      if (!silent) {
        setDcaOrdersError(null);
      }

      try {
        if (!selectedDcaProviderId) {
          setDcaOrders([]);
          setDcaOrdersError("Select a DCA backend to load orders");
          return;
        }

        const page = await wallet.dca().getOrders({
          provider: selectedDcaProviderId,
          size: DCA_ORDER_PAGE_SIZE,
        });
        setDcaOrders(page.content);
        setDcaOrdersError(null);
        if (!silent) {
          addLog(
            `Loaded ${page.content.length} ${selectedDcaProviderId.toUpperCase()} DCA orders`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDcaOrdersError(message);
        addLog(`DCA orders refresh failed: ${message}`);
      } finally {
        setIsRefreshingDcaOrders(false);
      }
    },
    [addLog, selectedDcaProviderId, wallet]
  );

  useEffect(() => {
    if (screenMode !== "dca" || !wallet) {
      return;
    }
    void refreshDcaOrders(true);
  }, [chainId, refreshDcaOrders, screenMode, selectedDcaProviderId, wallet]);

  useEffect(() => {
    setDcaPreview(null);
    setDcaError(null);
  }, [chainId]);

  const handleRefresh = useCallback(async () => {
    if (!wallet) {
      return;
    }

    await fetchBalances(wallet, chainId);
    if (screenMode === "dca") {
      await refreshDcaOrders(true);
    }
  }, [chainId, fetchBalances, refreshDcaOrders, screenMode, wallet]);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    if (walletType === "privy") {
      await logout();
    }
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [clearBalances, disconnect, logout, resetNetworkConfig, walletType]);

  const handleCopyAddress = useCallback(async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    addLog("Wallet address copied");
  }, [addLog, wallet]);

  const handleSelectScreenMode = useCallback((nextMode: ScreenMode) => {
    setScreenMode(nextMode);
    setQuoteError(null);
    setDcaError(null);
  }, []);

  const handleSelectIntegration = useCallback((integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    setQuoteError(null);
  }, []);

  const handleSelectDcaProvider = useCallback((providerId: string) => {
    setSelectedDcaProviderId(providerId);
    setDcaOrders([]);
    setDcaPreview(null);
    setDcaError(null);
    setDcaOrdersError(null);
  }, []);

  const handleSelectDcaPreviewProvider = useCallback(
    (integrationId: string) => {
      setSelectedDcaPreviewProviderId(integrationId);
      setDcaPreview(null);
      setDcaError(null);
    },
    []
  );

  const handleOpenTokenPicker = useCallback((mode: TokenPickerMode) => {
    setPickerMode(mode);
    setTokenSearch("");
    setShowTokenPicker(true);
  }, []);

  const handleSelectToken = useCallback(
    (token: Token) => {
      const pickerTokens = pickerMode.startsWith("dca")
        ? dcaTokens
        : tokenPickerTokens;

      switch (pickerMode) {
        case "swap-from": {
          setFromToken(token);
          if (token.address === toToken.address) {
            const alternative = pickerTokens.find(
              (candidate) => candidate.address !== token.address
            );
            if (alternative) {
              setToToken(alternative);
            }
          }
          setQuoteError(null);
          break;
        }
        case "swap-to": {
          setToToken(token);
          if (token.address === fromToken.address) {
            const alternative = pickerTokens.find(
              (candidate) => candidate.address !== token.address
            );
            if (alternative) {
              setFromToken(alternative);
            }
          }
          setQuoteError(null);
          break;
        }
        case "dca-from": {
          setDcaSellToken(token);
          if (token.address === dcaBuyToken.address) {
            const alternative = pickerTokens.find(
              (candidate) => candidate.address !== token.address
            );
            if (alternative) {
              setDcaBuyToken(alternative);
            }
          }
          setDcaPreview(null);
          setDcaError(null);
          break;
        }
        case "dca-to": {
          setDcaBuyToken(token);
          if (token.address === dcaSellToken.address) {
            const alternative = pickerTokens.find(
              (candidate) => candidate.address !== token.address
            );
            if (alternative) {
              setDcaSellToken(alternative);
            }
          }
          setDcaPreview(null);
          setDcaError(null);
          break;
        }
      }

      clearTokenPicker();
    },
    [
      clearTokenPicker,
      dcaBuyToken.address,
      dcaSellToken.address,
      dcaTokens,
      fromToken.address,
      pickerMode,
      toToken.address,
      tokenPickerTokens,
    ]
  );

  const handleFlipTokens = useCallback(() => {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuoteError(null);
  }, [fromToken, toToken]);

  const handleFlipDcaTokens = useCallback(() => {
    setDcaSellToken(dcaBuyToken);
    setDcaBuyToken(dcaSellToken);
    setDcaPreview(null);
    setDcaError(null);
  }, [dcaBuyToken, dcaSellToken]);

  const handleAmountChange = useCallback((value: string) => {
    setAmount(value);
    setQuoteError(null);
  }, []);

  const handleDcaTotalAmountChange = useCallback((value: string) => {
    setDcaTotalAmount(value);
    setDcaPreview(null);
    setDcaError(null);
  }, []);

  const handleDcaCycleAmountChange = useCallback((value: string) => {
    setDcaCycleAmount(value);
    setDcaPreview(null);
    setDcaError(null);
  }, []);

  const handleSwapSubmit = useCallback(async () => {
    if (!wallet || !amountIn || !selectedIntegration) return;

    setQuoteError(null);
    setIsSubmitting(true);

    try {
      const wantsSponsored = useSponsored && canUseSponsored;
      addLog(
        `Submitting ${getSwapProviderLabel(selectedIntegration)} swap ${amount} ${fromToken.symbol} -> ${toToken.symbol}`
      );

      const tx = await wallet.swap(
        {
          provider: selectedIntegration,
          tokenIn: fromToken,
          tokenOut: toToken,
          amountIn,
        },
        wantsSponsored ? { feeMode: "sponsored" } : undefined
      );

      addLog(`Swap tx submitted: ${tx.hash.slice(0, 10)}...`);
      addLog(
        wantsSponsored
          ? "Transaction submitted in sponsored mode"
          : "Transaction submitted in user_pays mode"
      );

      showTransactionToast(
        {
          txHash: tx.hash,
          title: `Swapping ${fromToken.symbol}`,
          subtitle: `${amount} ${fromToken.symbol} -> ${toToken.symbol}`,
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        },
        true
      );

      addLog("Waiting for confirmation...");
      await tx.wait();

      updateTransactionToast({
        txHash: tx.hash,
        title: "Swap Complete",
        subtitle: `${fromToken.symbol} -> ${toToken.symbol} confirmed`,
        explorerUrl: getExplorerUrl(tx.hash, chainId),
      });

      addLog("Swap confirmed");
      await fetchBalances(wallet, chainId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQuoteError(message);
      addLog(`Swap failed: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    addLog,
    amount,
    amountIn,
    canUseSponsored,
    chainId,
    fetchBalances,
    fromToken,
    selectedIntegration,
    toToken,
    useSponsored,
    wallet,
  ]);

  const handlePreviewDca = useCallback(async () => {
    if (!wallet || !parsedDcaCycleAmount || !selectedDcaPreviewProviderId) {
      return;
    }

    setDcaPreview(null);
    setDcaError(null);
    setIsDcaPreviewing(true);

    try {
      addLog(
        `Previewing ${selectedDcaPreviewProviderId.toUpperCase()} DCA cycle ${dcaCycleAmount} ${dcaSellToken.symbol} -> ${dcaBuyToken.symbol}`
      );

      const quote = await wallet.dca().previewCycle({
        buyToken: dcaBuyToken,
        sellAmountPerCycle: parsedDcaCycleAmount,
        sellToken: dcaSellToken,
        swapProvider: selectedDcaPreviewProviderId,
      });

      setDcaPreview({
        amountOutBase: quote.amountOutBase,
        priceImpactBps: quote.priceImpactBps,
        providerId: quote.provider ?? selectedDcaPreviewProviderId,
        routeCallCount: quote.routeCallCount,
      });

      addLog(
        `DCA cycle preview received: ${Amount.fromRaw(
          quote.amountOutBase,
          dcaBuyToken.decimals,
          dcaBuyToken.symbol
        ).toFormatted(true)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDcaError(message);
      addLog(`DCA preview failed: ${message}`);
    } finally {
      setIsDcaPreviewing(false);
    }
  }, [
    addLog,
    dcaBuyToken,
    dcaCycleAmount,
    dcaSellToken,
    parsedDcaCycleAmount,
    selectedDcaPreviewProviderId,
    wallet,
  ]);

  const handleCreateDca = useCallback(async () => {
    if (
      !wallet ||
      !parsedDcaTotalAmount ||
      !parsedDcaCycleAmount ||
      !selectedDcaProviderId
    ) {
      return;
    }

    setDcaError(null);
    setIsDcaSubmitting(true);

    try {
      const wantsSponsored = useSponsored && canUseSponsored;
      addLog(
        `Creating ${selectedDcaProviderId.toUpperCase()} DCA order ${dcaTotalAmount} ${dcaSellToken.symbol} total / ${dcaCycleAmount} per cycle into ${dcaBuyToken.symbol} (${dcaFrequency})`
      );

      const tx = await wallet.dca().create(
        {
          provider: selectedDcaProviderId,
          buyToken: dcaBuyToken,
          frequency: dcaFrequency,
          sellAmount: parsedDcaTotalAmount,
          sellAmountPerCycle: parsedDcaCycleAmount,
          sellToken: dcaSellToken,
        },
        wantsSponsored ? { feeMode: "sponsored" } : undefined
      );

      addLog(`DCA create tx submitted: ${tx.hash.slice(0, 10)}...`);
      addLog(
        wantsSponsored
          ? "DCA transaction submitted in sponsored mode"
          : "DCA transaction submitted in user_pays mode"
      );

      showTransactionToast(
        {
          txHash: tx.hash,
          title: `Creating ${dcaSellToken.symbol} DCA`,
          subtitle: `${dcaCycleAmount} / cycle into ${dcaBuyToken.symbol}`,
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        },
        true
      );

      addLog("Waiting for DCA confirmation...");
      await tx.wait();

      updateTransactionToast({
        txHash: tx.hash,
        title: "DCA Created",
        subtitle: `${dcaSellToken.symbol} -> ${dcaBuyToken.symbol} confirmed`,
        explorerUrl: getExplorerUrl(tx.hash, chainId),
      });

      addLog("DCA order created");
      await fetchBalances(wallet, chainId);
      await refreshDcaOrders(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDcaError(message);
      addLog(`DCA creation failed: ${message}`);
    } finally {
      setIsDcaSubmitting(false);
    }
  }, [
    addLog,
    canUseSponsored,
    chainId,
    dcaBuyToken,
    dcaCycleAmount,
    dcaFrequency,
    dcaSellToken,
    dcaTotalAmount,
    fetchBalances,
    parsedDcaCycleAmount,
    parsedDcaTotalAmount,
    refreshDcaOrders,
    selectedDcaProviderId,
    useSponsored,
    wallet,
  ]);

  const handleCancelDcaOrder = useCallback(
    async (order: DcaOrder) => {
      if (!wallet) {
        return;
      }

      setCancellingDcaOrderId(order.id);
      setDcaError(null);

      try {
        const wantsSponsored = useSponsored && canUseSponsored;
        addLog(
          `Cancelling ${getDcaProviderLabel(order.providerId)} DCA order ${cropAddress(order.orderAddress)}`
        );

        const tx = await wallet
          .dca()
          .cancel(
            buildDcaCancelInput(order),
            wantsSponsored ? { feeMode: "sponsored" } : undefined
          );

        showTransactionToast(
          {
            txHash: tx.hash,
            title: "Cancelling DCA",
            subtitle: cropAddress(order.orderAddress),
            explorerUrl: getExplorerUrl(tx.hash, chainId),
          },
          true
        );

        addLog("Waiting for cancel confirmation...");
        await tx.wait();

        updateTransactionToast({
          txHash: tx.hash,
          title: "DCA Cancelled",
          subtitle: cropAddress(order.orderAddress),
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        });

        addLog(`DCA order cancelled: ${cropAddress(order.orderAddress)}`);
        await fetchBalances(wallet, chainId);
        await refreshDcaOrders(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDcaError(message);
        addLog(`DCA cancel failed: ${message}`);
      } finally {
        setCancellingDcaOrderId(null);
      }
    },
    [
      addLog,
      canUseSponsored,
      chainId,
      fetchBalances,
      refreshDcaOrders,
      useSponsored,
      wallet,
    ]
  );

  if (!wallet) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingBalances || isRefreshingDcaOrders}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <ThemedText type="title">Swap &amp; DCA</ThemedText>
            <ThemedText
              style={[styles.headerSubtitle, { color: textSecondary }]}
            >
              {screenMode === "swap"
                ? "Spot execution through the configured swap providers."
                : selectedDcaProvider
                  ? `${getDcaProviderLabel(selectedDcaProvider.id)} recurring backend with configurable cycle preview routing.`
                  : "Recurring orders with configurable backend and cycle preview routing."}
            </ThemedText>
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

        <View style={[styles.modeSwitch, { backgroundColor: borderColor }]}>
          {(["swap", "dca"] as const).map((mode) => {
            const selected = screenMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.modeSegment,
                  selected && styles.modeSegmentSelected,
                ]}
                onPress={() => handleSelectScreenMode(mode)}
                activeOpacity={0.88}
              >
                <ThemedText
                  style={[
                    styles.modeSegmentText,
                    selected
                      ? styles.modeSegmentTextSelected
                      : { color: primaryColor },
                  ]}
                >
                  {mode === "swap" ? "Swap" : "DCA"}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>

        {screenMode === "swap" ? (
          <>
            <View
              style={[styles.card, { backgroundColor: cardBg, borderColor }]}
            >
              <View style={styles.addressRow}>
                <ThemedText
                  style={[styles.addressLabel, { color: textSecondary }]}
                >
                  Wallet
                </ThemedText>
                <TouchableOpacity
                  style={[
                    styles.addressButton,
                    { backgroundColor: borderColor },
                  ]}
                  onPress={handleCopyAddress}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[styles.addressText, { color: textSecondary }]}
                  >
                    {cropAddress(wallet.address)}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Swap Source
                </ThemedText>
                <View style={styles.integrationRow}>
                  {availableIntegrations.map((integration) => {
                    const selected = selectedIntegration?.id === integration.id;
                    return (
                      <TouchableOpacity
                        key={integration.id}
                        style={[
                          styles.integrationPill,
                          { borderColor },
                          selected && styles.integrationPillSelected,
                        ]}
                        onPress={() => handleSelectIntegration(integration.id)}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.integrationPillText,
                            selected
                              ? styles.integrationPillTextSelected
                              : { color: textSecondary },
                          ]}
                        >
                          {getSwapProviderLabel(integration)}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!availableIntegrations.length && (
                  <ThemedText style={styles.errorText}>
                    No swap integrations are configured for this network
                  </ThemedText>
                )}
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  From
                </ThemedText>
                <TouchableOpacity
                  style={[styles.tokenRow, { borderColor }]}
                  onPress={() => handleOpenTokenPicker("swap-from")}
                  activeOpacity={0.88}
                >
                  <View style={styles.tokenRowLeft}>
                    <TinyTokenLogo token={fromToken} />
                    <View style={styles.tokenTextStack}>
                      <ThemedText style={styles.tokenSymbol}>
                        {fromToken.symbol}
                      </ThemedText>
                      <ThemedText
                        style={[styles.tokenName, { color: textSecondary }]}
                      >
                        {fromToken.name}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText
                    style={[styles.chevronText, { color: textSecondary }]}
                  >
                    ▼
                  </ThemedText>
                </TouchableOpacity>
                <ThemedText
                  style={[styles.balanceText, { color: textSecondary }]}
                >
                  Balance: {fromBalance ? fromBalance.toFormatted(true) : "—"}
                </ThemedText>
              </View>

              <TouchableOpacity
                style={[styles.flipButton, { backgroundColor: borderColor }]}
                onPress={handleFlipTokens}
                activeOpacity={0.88}
              >
                <Ionicons name="swap-vertical" size={16} color={primaryColor} />
              </TouchableOpacity>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  To
                </ThemedText>
                <TouchableOpacity
                  style={[styles.tokenRow, { borderColor }]}
                  onPress={() => handleOpenTokenPicker("swap-to")}
                  activeOpacity={0.88}
                >
                  <View style={styles.tokenRowLeft}>
                    <TinyTokenLogo token={toToken} />
                    <View style={styles.tokenTextStack}>
                      <ThemedText style={styles.tokenSymbol}>
                        {toToken.symbol}
                      </ThemedText>
                      <ThemedText
                        style={[styles.tokenName, { color: textSecondary }]}
                      >
                        {toToken.name}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText
                    style={[styles.chevronText, { color: textSecondary }]}
                  >
                    ▼
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Amount In
                </ThemedText>
                <View style={[styles.amountRow, { borderColor }]}>
                  <TextInput
                    style={[
                      styles.amountInput,
                      { color: exceedsBalance ? "#e53935" : primaryColor },
                    ]}
                    value={amount}
                    onChangeText={handleAmountChange}
                    placeholder="0.0"
                    placeholderTextColor={textSecondary}
                    keyboardType="decimal-pad"
                  />
                  {fromBalance && (
                    <TouchableOpacity
                      style={[
                        styles.maxButton,
                        { backgroundColor: borderColor },
                      ]}
                      onPress={() => handleAmountChange(fromBalance.toUnit())}
                      activeOpacity={0.88}
                    >
                      <ThemedText
                        style={[styles.maxButtonText, { color: primaryColor }]}
                      >
                        MAX
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
                {exceedsBalance && (
                  <ThemedText style={styles.errorText}>
                    Amount exceeds {fromToken.symbol} balance
                  </ThemedText>
                )}
                {amountParseError && (
                  <ThemedText style={styles.errorText}>
                    {amountParseError}
                  </ThemedText>
                )}
              </View>

              <ThemedText style={[styles.callsHint, { color: textSecondary }]}>
                Quotes and route calls are fetched from{" "}
                {selectedIntegration
                  ? getSwapProviderLabel(selectedIntegration)
                  : "the selected integration"}{" "}
                automatically.
              </ThemedText>

              <View style={styles.sponsoredRow}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Sponsored
                </ThemedText>
                <View
                  style={[
                    styles.sponsoredSwitch,
                    (!canUseSponsored || isSubmitting) &&
                      styles.sponsoredSwitchDisabled,
                  ]}
                  pointerEvents={
                    !canUseSponsored || isSubmitting ? "none" : "auto"
                  }
                >
                  <TouchableOpacity
                    style={[
                      styles.sponsoredSegment,
                      !useSponsored && styles.sponsoredSegmentSelected,
                    ]}
                    onPress={() => setUseSponsored(false)}
                    disabled={!canUseSponsored || isSubmitting}
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
                    disabled={!canUseSponsored || isSubmitting}
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
                <ThemedText
                  style={[styles.callsHint, { color: textSecondary }]}
                >
                  Paymaster not configured
                </ThemedText>
              )}
              {sameToken && (
                <ThemedText style={styles.errorText}>
                  From and To tokens must be different
                </ThemedText>
              )}
              {quoteError && (
                <ThemedText style={styles.errorText}>{quoteError}</ThemedText>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                canSubmit
                  ? { backgroundColor: "#000" }
                  : { backgroundColor: borderColor },
                !canSubmit && styles.buttonDisabled,
              ]}
              onPress={handleSwapSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator
                  size="small"
                  color={canSubmit ? "#fff" : primaryColor}
                />
              ) : (
                <ThemedText
                  style={[
                    styles.submitButtonText,
                    { color: canSubmit ? "#fff" : primaryColor },
                  ]}
                >
                  Submit Swap
                </ThemedText>
              )}
            </TouchableOpacity>

            <ThemedText style={[styles.hint, { color: textSecondary }]}>
              Pull down to refresh balances
            </ThemedText>
          </>
        ) : (
          <>
            <View
              style={[styles.card, { backgroundColor: cardBg, borderColor }]}
            >
              <View style={styles.addressRow}>
                <ThemedText
                  style={[styles.addressLabel, { color: textSecondary }]}
                >
                  Wallet
                </ThemedText>
                <TouchableOpacity
                  style={[
                    styles.addressButton,
                    { backgroundColor: borderColor },
                  ]}
                  onPress={handleCopyAddress}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[styles.addressText, { color: textSecondary }]}
                  >
                    {cropAddress(wallet.address)}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Recurring Backend
                </ThemedText>
                <View style={styles.integrationRow}>
                  {availableDcaProviders.map((provider) => {
                    const selected = selectedDcaProvider?.id === provider.id;
                    return (
                      <TouchableOpacity
                        key={provider.id}
                        style={[
                          styles.integrationPill,
                          { borderColor },
                          selected && styles.integrationPillSelected,
                        ]}
                        onPress={() => handleSelectDcaProvider(provider.id)}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.integrationPillText,
                            selected
                              ? styles.integrationPillTextSelected
                              : { color: textSecondary },
                          ]}
                        >
                          {getDcaProviderLabel(provider.id)}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <ThemedText
                  style={[styles.callsHint, { color: textSecondary }]}
                >
                  {selectedDcaProvider?.id === "ekubo"
                    ? "Ekubo creates a native continuous TWAMM order."
                    : "Avnu creates a discrete recurring order with optional min/max guards."}
                </ThemedText>
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Preview Source
                </ThemedText>
                <View style={styles.integrationRow}>
                  {availableIntegrations.map((integration) => {
                    const selected =
                      selectedDcaPreviewProvider?.id === integration.id;
                    return (
                      <TouchableOpacity
                        key={integration.id}
                        style={[
                          styles.integrationPill,
                          { borderColor },
                          selected && styles.integrationPillSelected,
                        ]}
                        onPress={() =>
                          handleSelectDcaPreviewProvider(integration.id)
                        }
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.integrationPillText,
                            selected
                              ? styles.integrationPillTextSelected
                              : { color: textSecondary },
                          ]}
                        >
                          {getSwapProviderLabel(integration)}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <ThemedText
                  style={[styles.callsHint, { color: textSecondary }]}
                >
                  The selected source only affects the single-cycle preview.
                </ThemedText>
                {!availableIntegrations.length && (
                  <ThemedText style={styles.errorText}>
                    No preview integrations are configured for this network
                  </ThemedText>
                )}
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Sell Token
                </ThemedText>
                <TouchableOpacity
                  style={[styles.tokenRow, { borderColor }]}
                  onPress={() => handleOpenTokenPicker("dca-from")}
                  activeOpacity={0.88}
                >
                  <View style={styles.tokenRowLeft}>
                    <TinyTokenLogo token={dcaSellToken} />
                    <View style={styles.tokenTextStack}>
                      <ThemedText style={styles.tokenSymbol}>
                        {dcaSellToken.symbol}
                      </ThemedText>
                      <ThemedText
                        style={[styles.tokenName, { color: textSecondary }]}
                      >
                        {dcaSellToken.name}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText
                    style={[styles.chevronText, { color: textSecondary }]}
                  >
                    ▼
                  </ThemedText>
                </TouchableOpacity>
                <ThemedText
                  style={[styles.balanceText, { color: textSecondary }]}
                >
                  Balance:{" "}
                  {dcaSellBalance ? dcaSellBalance.toFormatted(true) : "—"}
                </ThemedText>
              </View>

              <TouchableOpacity
                style={[styles.flipButton, { backgroundColor: borderColor }]}
                onPress={handleFlipDcaTokens}
                activeOpacity={0.88}
              >
                <Ionicons name="swap-vertical" size={16} color={primaryColor} />
              </TouchableOpacity>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Buy Token
                </ThemedText>
                <TouchableOpacity
                  style={[styles.tokenRow, { borderColor }]}
                  onPress={() => handleOpenTokenPicker("dca-to")}
                  activeOpacity={0.88}
                >
                  <View style={styles.tokenRowLeft}>
                    <TinyTokenLogo token={dcaBuyToken} />
                    <View style={styles.tokenTextStack}>
                      <ThemedText style={styles.tokenSymbol}>
                        {dcaBuyToken.symbol}
                      </ThemedText>
                      <ThemedText
                        style={[styles.tokenName, { color: textSecondary }]}
                      >
                        {dcaBuyToken.name}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText
                    style={[styles.chevronText, { color: textSecondary }]}
                  >
                    ▼
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Total Sell Amount
                </ThemedText>
                <View style={[styles.amountRow, { borderColor }]}>
                  <TextInput
                    style={[
                      styles.amountInput,
                      { color: dcaExceedsBalance ? "#e53935" : primaryColor },
                    ]}
                    value={dcaTotalAmount}
                    onChangeText={handleDcaTotalAmountChange}
                    placeholder="0.0"
                    placeholderTextColor={textSecondary}
                    keyboardType="decimal-pad"
                  />
                  {dcaSellBalance && (
                    <TouchableOpacity
                      style={[
                        styles.maxButton,
                        { backgroundColor: borderColor },
                      ]}
                      onPress={() =>
                        handleDcaTotalAmountChange(dcaSellBalance.toUnit())
                      }
                      activeOpacity={0.88}
                    >
                      <ThemedText
                        style={[styles.maxButtonText, { color: primaryColor }]}
                      >
                        MAX
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
                {dcaExceedsBalance && (
                  <ThemedText style={styles.errorText}>
                    Total amount exceeds {dcaSellToken.symbol} balance
                  </ThemedText>
                )}
                {dcaTotalAmountError && (
                  <ThemedText style={styles.errorText}>
                    {dcaTotalAmountError}
                  </ThemedText>
                )}
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Per Cycle
                </ThemedText>
                <View style={[styles.amountRow, { borderColor }]}>
                  <TextInput
                    style={[styles.amountInput, { color: primaryColor }]}
                    value={dcaCycleAmount}
                    onChangeText={handleDcaCycleAmountChange}
                    placeholder="0.0"
                    placeholderTextColor={textSecondary}
                    keyboardType="decimal-pad"
                  />
                </View>
                {dcaCycleAmountError && (
                  <ThemedText style={styles.errorText}>
                    {dcaCycleAmountError}
                  </ThemedText>
                )}
                {dcaCycleExceedsTotal && (
                  <ThemedText style={styles.errorText}>
                    Per-cycle amount must be less than or equal to the total
                  </ThemedText>
                )}
              </View>

              <View style={styles.fieldSection}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Frequency
                </ThemedText>
                <View style={styles.integrationRow}>
                  {DCA_FREQUENCY_OPTIONS.map((option) => {
                    const selected = dcaFrequency === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.integrationPill,
                          { borderColor },
                          selected && styles.integrationPillSelected,
                        ]}
                        onPress={() => {
                          setDcaFrequency(option.value);
                          setDcaPreview(null);
                          setDcaError(null);
                        }}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.integrationPillText,
                            selected
                              ? styles.integrationPillTextSelected
                              : { color: textSecondary },
                          ]}
                        >
                          {option.label}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sponsoredRow}>
                <ThemedText
                  style={[styles.fieldLabel, { color: textSecondary }]}
                >
                  Sponsored
                </ThemedText>
                <View
                  style={[
                    styles.sponsoredSwitch,
                    (!canUseSponsored ||
                      isDcaSubmitting ||
                      cancellingDcaOrderId != null) &&
                      styles.sponsoredSwitchDisabled,
                  ]}
                  pointerEvents={
                    !canUseSponsored ||
                    isDcaSubmitting ||
                    cancellingDcaOrderId != null
                      ? "none"
                      : "auto"
                  }
                >
                  <TouchableOpacity
                    style={[
                      styles.sponsoredSegment,
                      !useSponsored && styles.sponsoredSegmentSelected,
                    ]}
                    onPress={() => setUseSponsored(false)}
                    disabled={
                      !canUseSponsored ||
                      isDcaSubmitting ||
                      cancellingDcaOrderId != null
                    }
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
                    disabled={
                      !canUseSponsored ||
                      isDcaSubmitting ||
                      cancellingDcaOrderId != null
                    }
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
                <ThemedText
                  style={[styles.callsHint, { color: textSecondary }]}
                >
                  Paymaster not configured
                </ThemedText>
              )}
              {dcaSameToken && (
                <ThemedText style={styles.errorText}>
                  Sell and buy tokens must be different
                </ThemedText>
              )}
              {dcaError && (
                <ThemedText style={styles.errorText}>{dcaError}</ThemedText>
              )}

              {dcaPreview && (
                <View
                  style={[styles.previewCard, { backgroundColor: borderColor }]}
                >
                  <View style={styles.previewRow}>
                    <ThemedText
                      style={[styles.previewLabel, { color: textSecondary }]}
                    >
                      Source
                    </ThemedText>
                    <ThemedText style={styles.previewValue}>
                      {dcaPreviewProviderLabel ?? "Preview"}
                    </ThemedText>
                  </View>
                  <View style={styles.previewRow}>
                    <ThemedText
                      style={[styles.previewLabel, { color: textSecondary }]}
                    >
                      Backend
                    </ThemedText>
                    <ThemedText style={styles.previewValue}>
                      {dcaBackendLabel ?? "DCA"}
                    </ThemedText>
                  </View>
                  <View style={styles.previewRow}>
                    <ThemedText
                      style={[styles.previewLabel, { color: textSecondary }]}
                    >
                      Sell
                    </ThemedText>
                    <ThemedText style={styles.previewValue}>
                      {parsedDcaCycleAmount?.toFormatted(true) ?? "—"}
                    </ThemedText>
                  </View>
                  <View style={styles.previewRow}>
                    <ThemedText
                      style={[styles.previewLabel, { color: textSecondary }]}
                    >
                      Est. Buy
                    </ThemedText>
                    <ThemedText style={styles.previewValue}>
                      {Amount.fromRaw(
                        dcaPreview.amountOutBase,
                        dcaBuyToken.decimals,
                        dcaBuyToken.symbol
                      ).toFormatted(true)}
                    </ThemedText>
                  </View>
                  <View style={styles.previewRow}>
                    <ThemedText
                      style={[styles.previewLabel, { color: textSecondary }]}
                    >
                      Price Impact
                    </ThemedText>
                    <ThemedText style={styles.previewValue}>
                      {dcaPreview.priceImpactBps == null
                        ? "n/a"
                        : `${(Number(dcaPreview.priceImpactBps) / 100).toFixed(2)}%`}
                    </ThemedText>
                  </View>
                  <View style={styles.previewRow}>
                    <ThemedText
                      style={[styles.previewLabel, { color: textSecondary }]}
                    >
                      Route Calls
                    </ThemedText>
                    <ThemedText style={styles.previewValue}>
                      {dcaPreview.routeCallCount != null
                        ? `${dcaPreview.routeCallCount}`
                        : "n/a"}
                    </ThemedText>
                  </View>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { borderColor },
                    !canPreviewDca && styles.buttonDisabled,
                  ]}
                  onPress={handlePreviewDca}
                  disabled={!canPreviewDca}
                  activeOpacity={0.85}
                >
                  {isDcaPreviewing ? (
                    <ActivityIndicator size="small" color={primaryColor} />
                  ) : (
                    <ThemedText
                      style={[
                        styles.secondaryButtonText,
                        { color: primaryColor },
                      ]}
                    >
                      Preview Cycle
                    </ThemedText>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryActionButton,
                    canCreateDca
                      ? { backgroundColor: "#000" }
                      : { backgroundColor: borderColor },
                    !canCreateDca && styles.buttonDisabled,
                  ]}
                  onPress={handleCreateDca}
                  disabled={!canCreateDca}
                  activeOpacity={0.85}
                >
                  {isDcaSubmitting ? (
                    <ActivityIndicator
                      size="small"
                      color={canCreateDca ? "#fff" : primaryColor}
                    />
                  ) : (
                    <ThemedText
                      style={[
                        styles.primaryActionButtonText,
                        { color: canCreateDca ? "#fff" : primaryColor },
                      ]}
                    >
                      Create DCA
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View
              style={[
                styles.card,
                styles.ordersCard,
                { backgroundColor: cardBg, borderColor },
              ]}
            >
              <View style={styles.ordersHeader}>
                <View style={styles.ordersHeaderText}>
                  <ThemedText style={styles.ordersTitle}>DCA Orders</ThemedText>
                  <ThemedText
                    style={[styles.ordersSubtitle, { color: textSecondary }]}
                  >
                    {selectedDcaProvider
                      ? `Refresh the latest ${getDcaProviderLabel(selectedDcaProvider.id)} orders for this wallet.`
                      : "Select a DCA backend to load orders."}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  style={[
                    styles.inlineButton,
                    { borderColor },
                    isRefreshingDcaOrders && styles.buttonDisabled,
                  ]}
                  onPress={() => void refreshDcaOrders()}
                  disabled={isRefreshingDcaOrders}
                  activeOpacity={0.88}
                >
                  {isRefreshingDcaOrders ? (
                    <ActivityIndicator size="small" color={primaryColor} />
                  ) : (
                    <ThemedText
                      style={[styles.inlineButtonText, { color: primaryColor }]}
                    >
                      Refresh
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>

              {dcaOrdersError && (
                <ThemedText style={styles.errorText}>
                  {dcaOrdersError}
                </ThemedText>
              )}

              {!dcaOrders.length &&
                !isRefreshingDcaOrders &&
                !dcaOrdersError && (
                  <ThemedText
                    style={[styles.emptyStateText, { color: textSecondary }]}
                  >
                    {selectedDcaProvider
                      ? `No ${getDcaProviderLabel(selectedDcaProvider.id)} DCA orders yet. Create one above to start recurring buys.`
                      : "Select a DCA backend to load orders."}
                  </ThemedText>
                )}

              {dcaOrders.map((order) => {
                const orderSellToken =
                  tokenMetadataByAddress.get(order.sellTokenAddress) ?? null;
                const orderBuyToken =
                  tokenMetadataByAddress.get(order.buyTokenAddress) ?? null;
                const isActiveOrder = order.status === "ACTIVE";
                const isCancelling = cancellingDcaOrderId === order.id;

                return (
                  <View
                    key={order.id}
                    style={[styles.orderItem, { borderColor }]}
                  >
                    <View style={styles.orderHeader}>
                      <View style={styles.orderHeaderLeft}>
                        <ThemedText style={styles.orderPairText}>
                          {(orderSellToken?.symbol ?? "SELL") +
                            " -> " +
                            (orderBuyToken?.symbol ?? "BUY")}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.orderAddressText,
                            { color: textSecondary },
                          ]}
                        >
                          {getDcaProviderLabel(order.providerId)} ·{" "}
                          {cropAddress(order.orderAddress)}
                        </ThemedText>
                      </View>
                      <View
                        style={[
                          styles.orderStatusPill,
                          isActiveOrder
                            ? styles.orderStatusPillActive
                            : { backgroundColor: borderColor },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.orderStatusText,
                            isActiveOrder
                              ? styles.orderStatusTextActive
                              : { color: primaryColor },
                          ]}
                        >
                          {order.status}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.orderFacts}>
                      <View style={styles.orderFactRow}>
                        <ThemedText
                          style={[
                            styles.orderFactLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Total
                        </ThemedText>
                        <ThemedText style={styles.orderFactValue}>
                          {formatTokenAmount(
                            order.sellAmountBase,
                            orderSellToken
                          )}
                        </ThemedText>
                      </View>
                      <View style={styles.orderFactRow}>
                        <ThemedText
                          style={[
                            styles.orderFactLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Per cycle
                        </ThemedText>
                        <ThemedText style={styles.orderFactValue}>
                          {order.sellAmountPerCycleBase != null
                            ? formatTokenAmount(
                                order.sellAmountPerCycleBase,
                                orderSellToken
                              )
                            : "Continuous"}
                        </ThemedText>
                      </View>
                      <View style={styles.orderFactRow}>
                        <ThemedText
                          style={[
                            styles.orderFactLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Bought
                        </ThemedText>
                        <ThemedText style={styles.orderFactValue}>
                          {formatTokenAmount(
                            order.amountBoughtBase,
                            orderBuyToken
                          )}
                        </ThemedText>
                      </View>
                      <View style={styles.orderFactRow}>
                        <ThemedText
                          style={[
                            styles.orderFactLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Frequency
                        </ThemedText>
                        <ThemedText style={styles.orderFactValue}>
                          {getDcaFrequencyLabel(order.frequency)}
                        </ThemedText>
                      </View>
                      <View style={styles.orderFactRow}>
                        <ThemedText
                          style={[
                            styles.orderFactLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Created
                        </ThemedText>
                        <ThemedText style={styles.orderFactValue}>
                          {formatDateStamp(order.timestamp)}
                        </ThemedText>
                      </View>
                      <View style={styles.orderFactRow}>
                        <ThemedText
                          style={[
                            styles.orderFactLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Trades
                        </ThemedText>
                        <ThemedText style={styles.orderFactValue}>
                          {order.executedTradesCount} done /{" "}
                          {order.pendingTradesCount} pending /{" "}
                          {order.cancelledTradesCount} cancelled
                        </ThemedText>
                      </View>
                    </View>

                    {isActiveOrder && (
                      <TouchableOpacity
                        style={[
                          styles.cancelButton,
                          { borderColor },
                          isCancelling && styles.buttonDisabled,
                        ]}
                        onPress={() => void handleCancelDcaOrder(order)}
                        disabled={isCancelling}
                        activeOpacity={0.88}
                      >
                        {isCancelling ? (
                          <ActivityIndicator
                            size="small"
                            color={primaryColor}
                          />
                        ) : (
                          <ThemedText
                            style={[
                              styles.cancelButtonText,
                              { color: primaryColor },
                            ]}
                          >
                            Cancel Order
                          </ThemedText>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>

            <ThemedText style={[styles.hint, { color: textSecondary }]}>
              Pull down to refresh balances and DCA orders
            </ThemedText>
          </>
        )}
      </ScrollView>

      <Modal
        visible={showTokenPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={clearTokenPicker}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <View>
              <ThemedText type="title">Select Token</ThemedText>
              <ThemedText
                style={[styles.modalSubtitle, { color: textSecondary }]}
              >
                {pickerMode.startsWith("dca")
                  ? "Curated DCA token set for this network"
                  : "Search the available swap tokens"}
              </ThemedText>
            </View>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={clearTokenPicker}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.modalCloseText, { color: primaryColor }]}
              >
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[
              styles.tokenSearchInput,
              { borderColor, color: primaryColor },
            ]}
            value={tokenSearch}
            onChangeText={setTokenSearch}
            placeholder="Search symbol, name, or address"
            placeholderTextColor={textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={[styles.tokenPickerList, { borderColor }]}>
            {filteredTokenPickerTokens.map((token, index) => {
              const balance = getBalance(token);
              return (
                <View key={token.address}>
                  {index > 0 && (
                    <View
                      style={[
                        styles.tokenPickerDivider,
                        { backgroundColor: borderColor },
                      ]}
                    />
                  )}
                  <TouchableOpacity
                    style={styles.tokenPickerRow}
                    onPress={() => handleSelectToken(token)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.tokenPickerLeft}>
                      <TinyTokenLogo token={token} />
                      <View style={styles.tokenPickerStack}>
                        <ThemedText style={styles.tokenPickerSymbol}>
                          {token.symbol}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.tokenPickerAmount,
                            { color: textSecondary },
                          ]}
                        >
                          {balance ? balance.toFormatted(true) : "—"}
                        </ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
            {!filteredTokenPickerTokens.length && (
              <View style={styles.tokenPickerEmpty}>
                <ThemedText
                  style={[styles.tokenPickerAmount, { color: textSecondary }]}
                >
                  No tokens match your search
                </ThemedText>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <LogsFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    width: "100%",
  },
  addressButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  addressRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  addressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 10,
  },
  amountRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 10,
  },
  balanceText: {
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  callsHint: {
    fontSize: 11,
  },
  cancelButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    marginTop: 6,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: "100%",
  },
  chevronText: {
    fontSize: 12,
    fontWeight: "700",
  },
  container: { flex: 1 },
  content: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    paddingBottom: 120,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  disconnectLink: {
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  emptyStateText: {
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: "#e53935",
    fontSize: 12,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  fieldSection: {
    gap: 8,
  },
  flipButton: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    marginTop: 8,
    width: "100%",
  },
  headerRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  headerTitle: { flex: 1 },
  hint: {
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
    width: "100%",
  },
  inlineButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    minWidth: 86,
    paddingHorizontal: 12,
  },
  inlineButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  integrationPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  integrationPillSelected: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  integrationPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  integrationPillTextSelected: {
    color: "#fff",
  },
  integrationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  modalCloseButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  modeSegment: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    paddingVertical: 8,
  },
  modeSegmentSelected: {
    backgroundColor: "#000",
  },
  modeSegmentText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  modeSegmentTextSelected: {
    color: "#fff",
  },
  modeSwitch: {
    borderRadius: 999,
    flexDirection: "row",
    gap: 2,
    marginBottom: 14,
    padding: 2,
    width: "100%",
  },
  networkPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  networkPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  orderAddressText: {
    fontSize: 11,
  },
  orderFactLabel: {
    fontSize: 11,
  },
  orderFactRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderFactValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 12,
    textAlign: "right",
  },
  orderFacts: {
    gap: 6,
  },
  orderHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  orderItem: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  orderPairText: {
    fontSize: 14,
    fontWeight: "700",
  },
  ordersCard: {
    marginTop: 14,
  },
  ordersHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  ordersHeaderText: {
    flex: 1,
    gap: 4,
  },
  ordersSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  ordersTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  orderStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  orderStatusPillActive: {
    backgroundColor: "#000",
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  orderStatusTextActive: {
    color: "#fff",
  },
  previewCard: {
    borderRadius: 12,
    gap: 10,
    padding: 12,
  },
  previewLabel: {
    fontSize: 11,
    textTransform: "uppercase",
  },
  previewRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  primaryActionButton: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryActionButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  scrollView: { flex: 1 },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  sponsoredRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sponsoredSegment: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sponsoredSegmentSelected: {
    backgroundColor: "#000",
  },
  sponsoredSwitch: {
    backgroundColor: "#e5e5e5",
    borderRadius: 999,
    flexDirection: "row",
    gap: 2,
    padding: 2,
  },
  sponsoredSwitchDisabled: {
    opacity: 0.5,
  },
  sponsoredText: {
    color: "#111",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sponsoredTextSelected: {
    color: "#fff",
  },
  submitButton: {
    alignItems: "center",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
    width: "100%",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  tinyLogo: { borderRadius: 10, height: 20, width: 20 },
  tinyLogoPlaceholder: { alignItems: "center", justifyContent: "center" },
  tinyLogoText: { fontSize: 10, fontWeight: "600" },
  tokenName: {
    fontSize: 12,
  },
  tokenPickerAmount: {
    fontSize: 12,
  },
  tokenPickerDivider: {
    height: 1,
    width: "100%",
  },
  tokenPickerEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tokenPickerLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  tokenPickerList: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    overflow: "hidden",
  },
  tokenPickerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tokenPickerStack: {
    flexDirection: "column",
    gap: 2,
  },
  tokenPickerSymbol: {
    fontSize: 14,
    fontWeight: "700",
  },
  tokenRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tokenRowLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  tokenSearchInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: "700",
  },
  tokenTextStack: {
    flexDirection: "column",
  },
});
