import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  View,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePrivy } from "@privy-io/expo";

import { ThemedText } from "@/components/themed-text";
import { LogsFAB } from "@/components/LogsFAB";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import {
  useBalancesStore,
  getTokensForNetwork,
  getStrkToken,
  getWbtcToken,
} from "@/stores/balances";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { swapIntegrations } from "@/swaps";
import type { SwapIntegration } from "@/swaps/interface";
import { Amount, type ChainId, type Token } from "starkzap";

const WBTC_LOGO_FALLBACK =
  "https://altcoinsbox.com/wp-content/uploads/2023/01/wbtc-wrapped-bitcoin-logo.png";

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
  const availableIntegrations = useMemo(
    () =>
      swapIntegrations.filter((integration) =>
        integration.supportsChain(chainId)
      ),
    [chainId]
  );
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | null
  >(null);
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
  const selectedIntegration = useMemo<SwapIntegration | null>(() => {
    if (!availableIntegrations.length) {
      return null;
    }
    return (
      availableIntegrations.find(
        (integration) => integration.id === selectedIntegrationId
      ) ?? availableIntegrations[0]!
    );
  }, [availableIntegrations, selectedIntegrationId]);
  const integrationTokens = useMemo(() => {
    const tokens =
      selectedIntegration?.getAvailableTokens?.({
        chainId,
        tokens: allTokens,
      }) ?? allTokens;

    const uniqueByAddress = new Map<string, Token>();
    for (const token of tokens) {
      if (!uniqueByAddress.has(token.address)) {
        uniqueByAddress.set(token.address, token);
      }
    }
    return Array.from(uniqueByAddress.values());
  }, [selectedIntegration, chainId, allTokens]);
  const preferredOutputToken = useMemo(
    () =>
      selectedIntegration?.getRecommendedOutputToken?.({
        chainId,
        tokenIn: strkToken,
        tokens: integrationTokens,
      }) ?? null,
    [selectedIntegration, chainId, integrationTokens, strkToken]
  );
  const primaryTokens = useMemo(() => {
    const eth = integrationTokens.find((t) => t.symbol === "ETH");
    const fallbackToToken =
      preferredOutputToken ??
      integrationTokens.find((token) => token.address !== strkToken.address) ??
      strkToken;
    const ordered = [strkToken, wbtcToken, fallbackToToken, eth].filter(
      (t): t is Token => t != null
    );
    return ordered.filter(
      (token, index, items) =>
        items.findIndex((candidate) => candidate.address === token.address) ===
        index
    );
  }, [integrationTokens, strkToken, wbtcToken, preferredOutputToken]);
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

  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const [fromToken, setFromToken] = useState<Token>(strkToken);
  const [toToken, setToToken] = useState<Token>(
    preferredOutputToken ??
      primaryTokens.find((t) => t.address !== strkToken.address) ??
      strkToken
  );
  const [amount, setAmount] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useSponsored, setUseSponsored] = useState(
    preferSponsored && Boolean(paymasterNodeUrl)
  );
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"from" | "to">("from");
  const [tokenSearch, setTokenSearch] = useState("");

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
  }, [integrationTokens, primaryTokens, strkToken, preferredOutputToken]);

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

  const canUseSponsored = Boolean(paymasterNodeUrl);
  const canSubmit =
    !!wallet &&
    !!selectedIntegration &&
    !isSubmitting &&
    !!amountIn &&
    !sameToken &&
    !exceedsBalance &&
    !amountParseError;
  const filteredTokenPickerTokens = useMemo(() => {
    const query = tokenSearch.trim().toLowerCase();
    if (!query) {
      return tokenPickerTokens;
    }
    return tokenPickerTokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query)
    );
  }, [tokenPickerTokens, tokenSearch]);

  const handleRefresh = useCallback(async () => {
    if (wallet) {
      await fetchBalances(wallet, chainId);
    }
  }, [wallet, chainId, fetchBalances]);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    if (walletType === "privy") {
      await logout();
    }
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [clearBalances, disconnect, resetNetworkConfig, walletType, logout]);

  const handleCopyAddress = useCallback(async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    addLog("Wallet address copied");
  }, [wallet, addLog]);

  const handleSelectIntegration = useCallback((integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    setQuoteError(null);
  }, []);

  const handleOpenTokenPicker = useCallback((mode: "from" | "to") => {
    setPickerMode(mode);
    setTokenSearch("");
    setShowTokenPicker(true);
  }, []);

  const handleSelectToken = useCallback(
    (token: Token) => {
      if (pickerMode === "from") {
        setFromToken(token);
        if (token.address === toToken.address) {
          const alternative = tokenPickerTokens.find(
            (candidate) => candidate.address !== token.address
          );
          if (alternative) {
            setToToken(alternative);
          }
        }
      } else {
        setToToken(token);
        if (token.address === fromToken.address) {
          const alternative = tokenPickerTokens.find(
            (candidate) => candidate.address !== token.address
          );
          if (alternative) {
            setFromToken(alternative);
          }
        }
      }
      setQuoteError(null);
      setTokenSearch("");
      setShowTokenPicker(false);
    },
    [pickerMode, tokenPickerTokens, fromToken.address, toToken.address]
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

  const handleSubmit = useCallback(async () => {
    if (!wallet || !amountIn || !selectedIntegration) return;

    setQuoteError(null);
    setIsSubmitting(true);

    try {
      const wantsSponsored = useSponsored && canUseSponsored;
      addLog(
        `Submitting ${selectedIntegration.label} swap ${amount} ${fromToken.symbol} -> ${toToken.symbol}`
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
      if (wantsSponsored) {
        addLog("Transaction submitted in sponsored mode");
      } else {
        addLog("Transaction submitted in user_pays mode");
      }

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
    wallet,
    amount,
    amountIn,
    selectedIntegration,
    fromToken,
    toToken,
    useSponsored,
    canUseSponsored,
    chainId,
    addLog,
    fetchBalances,
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
            refreshing={isLoadingBalances}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <ThemedText type="title">Swap</ThemedText>
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

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.addressRow}>
            <ThemedText style={[styles.addressLabel, { color: textSecondary }]}>
              Wallet
            </ThemedText>
            <TouchableOpacity
              style={[styles.addressButton, { backgroundColor: borderColor }]}
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
            <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
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
                      {integration.label}
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
            <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
              From
            </ThemedText>
            <TouchableOpacity
              style={[styles.tokenRow, { borderColor }]}
              onPress={() => handleOpenTokenPicker("from")}
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
            <ThemedText style={[styles.balanceText, { color: textSecondary }]}>
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
            <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
              To
            </ThemedText>
            <TouchableOpacity
              style={[styles.tokenRow, { borderColor }]}
              onPress={() => handleOpenTokenPicker("to")}
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
            <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
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
                  style={[styles.maxButton, { backgroundColor: borderColor }]}
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
            {selectedIntegration?.label ?? "the selected integration"}{" "}
            automatically.
          </ThemedText>

          <View style={styles.sponsoredRow}>
            <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
              Sponsored
            </ThemedText>
            <View
              style={[
                styles.sponsoredSwitch,
                (!canUseSponsored || isSubmitting) &&
                  styles.sponsoredSwitchDisabled,
              ]}
              pointerEvents={!canUseSponsored || isSubmitting ? "none" : "auto"}
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
            <ThemedText style={[styles.callsHint, { color: textSecondary }]}>
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
          onPress={handleSubmit}
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
      </ScrollView>

      <Modal
        visible={showTokenPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setTokenSearch("");
          setShowTokenPicker(false);
        }}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">Select Token</ThemedText>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={() => {
                setTokenSearch("");
                setShowTokenPicker(false);
              }}
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
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 120,
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 14,
  },
  headerTitle: { flex: 1 },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  disconnectLink: {
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  addressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addressButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  fieldSection: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  integrationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  integrationPill: {
    borderWidth: 1,
    borderRadius: 999,
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
  tokenRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tokenRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tokenTextStack: {
    flexDirection: "column",
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: "700",
  },
  tokenName: {
    fontSize: 12,
  },
  chevronText: {
    fontSize: 12,
    fontWeight: "700",
  },
  balanceText: {
    fontSize: 12,
  },
  flipButton: {
    alignSelf: "center",
    borderRadius: 999,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
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
  callsHint: {
    fontSize: 11,
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
  submitButton: {
    width: "100%",
    marginTop: 14,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  hint: {
    width: "100%",
    marginTop: 12,
    textAlign: "center",
    fontSize: 12,
  },
  errorText: {
    color: "#e53935",
    fontSize: 12,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  tokenSearchInput: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  tokenPickerList: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  tokenPickerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tokenPickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tokenPickerStack: {
    flexDirection: "column",
    gap: 2,
  },
  tokenPickerSymbol: {
    fontSize: 14,
    fontWeight: "700",
  },
  tokenPickerAmount: {
    fontSize: 12,
  },
  tokenPickerEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tokenPickerDivider: {
    height: 1,
    width: "100%",
  },
  tinyLogo: { width: 20, height: 20, borderRadius: 10 },
  tinyLogoPlaceholder: { justifyContent: "center", alignItems: "center" },
  tinyLogoText: { fontSize: 10, fontWeight: "600" },
});
