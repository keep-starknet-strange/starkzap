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
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePrivy } from "@privy-io/expo";

import { LogsFAB } from "@/components/LogsFAB";
import { ThemedText } from "@/components/themed-text";
import { WalletHeader } from "@/components/wallet-header";
import { SponsoredToggle } from "@/components/sponsored-toggle";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  useDcaState,
  formatTokenAmount,
  getCuratedDcaTokens,
  getDefaultDcaPair,
  getExplorerUrl,
  getDcaProviderLabel,
} from "@/hooks/use-dca-state";
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
import { DcaPanel } from "@/components/dca-panel";
import {
  Amount,
  type SwapProvider,
  type SwapQuote,
  type Token,
} from "@starkzap/native";

const WBTC_LOGO_FALLBACK =
  "https://altcoinsbox.com/wp-content/uploads/2023/01/wbtc-wrapped-bitcoin-logo.png";

type ScreenMode = "swap" | "dca";
type TokenPickerMode = "swap-from" | "swap-to" | "dca-from" | "dca-to";

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
  const [fromToken, setFromToken] = useState<Token>(strkToken);
  const [toToken, setToToken] = useState<Token>(
    preferredOutputToken ??
      primaryTokens.find((token) => token.address !== strkToken.address) ??
      strkToken
  );
  const [amount, setAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useSponsored, setUseSponsored] = useState(
    preferSponsored && Boolean(paymasterNodeUrl)
  );
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<TokenPickerMode>("swap-from");
  const [tokenSearch, setTokenSearch] = useState("");

  const canUseSponsored = Boolean(paymasterNodeUrl);

  // DCA state hook
  const dca = useDcaState({
    wallet,
    chainId,
    addLog,
    fetchBalances,
    getBalance,
    availableIntegrations,
    availableDcaProviders,
    dcaTokens,
    dcaDefaultPair,
    useSponsored,
    canUseSponsored,
    screenMode,
  });

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

  useEffect(() => {
    if (
      screenMode !== "swap" ||
      !wallet ||
      !selectedIntegration ||
      !amountIn ||
      sameToken ||
      exceedsBalance ||
      amountParseError
    ) {
      setSwapQuote(null);
      setIsQuoteLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      setIsQuoteLoading(true);
      setSwapQuote(null);
      setQuoteError(null);

      wallet
        .getQuote({
          provider: selectedIntegration,
          tokenIn: fromToken,
          tokenOut: toToken,
          amountIn,
        })
        .then((quote) => {
          if (cancelled) {
            return;
          }
          setSwapQuote(quote);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          const message =
            error instanceof Error ? error.message : String(error);
          setQuoteError(message);
        })
        .finally(() => {
          if (!cancelled) {
            setIsQuoteLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    amountIn,
    amountParseError,
    exceedsBalance,
    fromToken,
    sameToken,
    screenMode,
    selectedIntegration,
    toToken,
    wallet,
  ]);

  const swapQuoteAmount = useMemo(() => {
    if (!swapQuote) {
      return null;
    }
    return formatTokenAmount(swapQuote.amountOutBase, toToken);
  }, [swapQuote, toToken]);

  const swapQuoteMeta = useMemo(() => {
    if (!selectedIntegration) {
      return null;
    }

    const sourceLabel = getSwapProviderLabel(selectedIntegration);
    if (isQuoteLoading) {
      return `Fetching ${sourceLabel} quote...`;
    }
    if (!swapQuote) {
      return null;
    }
    if (swapQuote.priceImpactBps == null) {
      return `Source: ${sourceLabel}`;
    }

    return `Source: ${sourceLabel} • Price impact: ${(
      Number(swapQuote.priceImpactBps) / 100
    ).toFixed(2)}%`;
  }, [isQuoteLoading, selectedIntegration, swapQuote]);

  const canSubmit =
    !!wallet &&
    !!selectedIntegration &&
    !isSubmitting &&
    !!amountIn &&
    !sameToken &&
    !exceedsBalance &&
    !amountParseError;

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

  const handleRefresh = useCallback(async () => {
    if (!wallet) {
      return;
    }

    await fetchBalances(wallet, chainId);
    if (screenMode === "dca") {
      await dca.refreshDcaOrders(true);
    }
  }, [chainId, dca, fetchBalances, screenMode, wallet]);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    if (walletType === "privy") {
      await logout();
    }
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [clearBalances, disconnect, logout, resetNetworkConfig, walletType]);

  const handleSelectScreenMode = useCallback((nextMode: ScreenMode) => {
    setScreenMode(nextMode);
    setQuoteError(null);
  }, []);

  const handleSelectIntegration = useCallback((integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    setQuoteError(null);
  }, []);

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
          dca.handleSelectDcaSellToken(token);
          break;
        }
        case "dca-to": {
          dca.handleSelectDcaBuyToken(token);
          break;
        }
      }

      clearTokenPicker();
    },
    [
      clearTokenPicker,
      dca,
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

  const handleAmountChange = useCallback((value: string) => {
    setAmount(value);
    setQuoteError(null);
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
            refreshing={isLoadingBalances || dca.isRefreshingDcaOrders}
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
                : dca.selectedDcaProvider
                  ? `${getDcaProviderLabel(dca.selectedDcaProvider.id)} recurring backend with configurable cycle preview routing.`
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
              <WalletHeader walletAddress={wallet.address} addLog={addLog} />

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
                  Balance:{" "}
                  {fromBalance ? fromBalance.toFormatted(true) : "\u2014"}
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
                Estimated receive updates automatically from{" "}
                {selectedIntegration
                  ? getSwapProviderLabel(selectedIntegration)
                  : "the selected integration"}{" "}
                for the current amount.
              </ThemedText>

              {(isQuoteLoading || swapQuote) && selectedIntegration && (
                <View
                  style={[
                    styles.quotePreviewCard,
                    { backgroundColor: borderColor },
                  ]}
                >
                  <View style={styles.quotePreviewRow}>
                    <ThemedText
                      style={[
                        styles.quotePreviewLabel,
                        { color: textSecondary },
                      ]}
                    >
                      Estimated Receive
                    </ThemedText>
                    {isQuoteLoading ? (
                      <ActivityIndicator size="small" color={primaryColor} />
                    ) : (
                      <ThemedText style={styles.quotePreviewValue}>
                        {swapQuoteAmount}
                      </ThemedText>
                    )}
                  </View>
                  {swapQuoteMeta && (
                    <ThemedText
                      style={[
                        styles.quotePreviewMeta,
                        { color: textSecondary },
                      ]}
                    >
                      {swapQuoteMeta}
                    </ThemedText>
                  )}
                </View>
              )}

              <SponsoredToggle
                useSponsored={useSponsored}
                setUseSponsored={setUseSponsored}
                canUseSponsored={canUseSponsored}
                disabled={isSubmitting}
              />

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
          <DcaPanel
            dca={dca}
            walletAddress={wallet.address}
            addLog={addLog}
            availableIntegrations={availableIntegrations}
            availableDcaProviders={availableDcaProviders}
            chainId={chainId}
            useSponsored={useSponsored}
            setUseSponsored={setUseSponsored}
            canUseSponsored={canUseSponsored}
            onOpenTokenPicker={handleOpenTokenPicker}
            tokenMetadataByAddress={tokenMetadataByAddress}
          />
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
                          {balance ? balance.toFormatted(true) : "\u2014"}
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
  quotePreviewCard: {
    borderRadius: 12,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quotePreviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  quotePreviewMeta: {
    fontSize: 12,
  },
  quotePreviewRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quotePreviewValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  scrollView: { flex: 1 },
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
