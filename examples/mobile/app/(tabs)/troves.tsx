import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import * as Haptics from "expo-haptics";
import { usePrivy } from "@privy-io/expo";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ThemedText } from "@/components/themed-text";
import { LogsFAB } from "@/components/LogsFAB";
import { showCopiedToast } from "@/components/Toast";
import { useThemeColor } from "@/hooks/use-theme-color";
import { NETWORKS, useWalletStore } from "@/stores/wallet";
import { useBalancesStore, getTokensForNetwork } from "@/stores/balances";
import { useTrovesStore } from "@/stores/troves";
import { cropAddress } from "@/utils";
import type {
  Amount,
  Token,
  TrovesDepositToken,
  TrovesStrategyAPIResult,
} from "starkzap-native";

type Action = "deposit" | "withdraw";

function formatApy(strategy: TrovesStrategyAPIResult): string {
  const numeric =
    typeof strategy.apy === "number"
      ? strategy.apy
      : strategy.apySplit.baseApy + strategy.apySplit.rewardsApy;
  if (numeric > 0) return `${(numeric * 100).toFixed(2)}%`;
  return typeof strategy.apy === "string" && strategy.apy ? strategy.apy : "—";
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatAmount(amount: Amount | null | undefined): string {
  if (!amount) return "0";
  const formatted = amount.toFormatted(true);
  const part = formatted.split(/\s+/).find((p) => /\d/.test(p));
  return part ?? "0";
}

function findBalance(
  depositToken: TrovesDepositToken,
  tokens: Token[],
  getBalance: (token: Token) => Amount | null
): Amount | null {
  const token = tokens.find(
    (t) => t.address.toLowerCase() === depositToken.address.toLowerCase()
  );
  return token ? getBalance(token) : null;
}

export default function TrovesScreen() {
  const {
    wallet,
    chainId,
    addLog,
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
  const {
    isLoadingStrategies,
    strategies,
    positions,
    tvlUsd,
    unsupportedReason,
    isBusy,
    loadStrategies,
    execute,
    clear,
  } = useTrovesStore();

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const inputBg = useThemeColor({}, "background");

  const [search, setSearch] = useState("");
  const [sheetStrategy, setSheetStrategy] =
    useState<TrovesStrategyAPIResult | null>(null);
  const [sheetAction, setSheetAction] = useState<Action>("deposit");
  const [sheetTokenIndex, setSheetTokenIndex] = useState(0);
  const [sheetAmount, setSheetAmount] = useState("");

  const tokens = useMemo(() => getTokensForNetwork(chainId), [chainId]);
  const networkName = useMemo(
    () =>
      NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())
        ?.name ?? "Custom",
    [chainId]
  );

  const filteredStrategies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return strategies;
    return strategies.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.depositTokens.some((t) => t.symbol.toLowerCase().includes(q))
    );
  }, [strategies, search]);

  useEffect(() => {
    if (!wallet) return;
    loadStrategies(wallet, chainId);
    fetchBalances(wallet, chainId);
    return () => {
      clear();
    };
  }, [wallet, chainId, loadStrategies, fetchBalances, clear]);

  const handleRefresh = useCallback(async () => {
    if (!wallet) return;
    await Promise.all([
      loadStrategies(wallet, chainId),
      fetchBalances(wallet, chainId),
    ]);
  }, [wallet, chainId, loadStrategies, fetchBalances]);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    clear();
    if (walletType === "privy") await logout();
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [
    clearBalances,
    clear,
    disconnect,
    resetNetworkConfig,
    walletType,
    logout,
  ]);

  const handleCopyAddress = useCallback(async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showCopiedToast();
  }, [wallet]);

  const openSheet = useCallback(
    (strategy: TrovesStrategyAPIResult, action: Action) => {
      setSheetStrategy(strategy);
      setSheetAction(action);
      setSheetTokenIndex(0);
      setSheetAmount("");
    },
    []
  );

  const closeSheet = useCallback(() => {
    setSheetStrategy(null);
    setSheetAmount("");
  }, []);

  const handleSheetSubmit = useCallback(async () => {
    if (!wallet || !sheetStrategy) return;
    const token = sheetStrategy.depositTokens[sheetTokenIndex];
    if (!token) return;
    const ok = await execute(
      sheetAction,
      sheetStrategy.id,
      token,
      wallet,
      chainId,
      sheetAmount,
      addLog
    );
    if (!ok) return;
    setSheetStrategy(null);
    setSheetAmount("");
    await fetchBalances(wallet, chainId);
  }, [
    wallet,
    chainId,
    sheetStrategy,
    sheetAction,
    sheetTokenIndex,
    sheetAmount,
    execute,
    addLog,
    fetchBalances,
  ]);

  if (!wallet) return null;

  const sheetToken = sheetStrategy?.depositTokens[sheetTokenIndex];
  const sheetBalance = sheetToken
    ? findBalance(sheetToken, tokens, getBalance)
    : null;
  const sheetPosition = sheetStrategy ? positions[sheetStrategy.id] : undefined;
  const sheetPositionAmount = sheetPosition
    ? (sheetPosition.amounts[sheetTokenIndex] ?? null)
    : null;
  const sheetSubmitDisabled = !sheetAmount.trim() || isBusy;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingStrategies || isLoadingBalances}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        <View style={styles.header}>
          <ThemedText type="title">Troves</ThemedText>
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

        <View
          style={[styles.summaryCard, { backgroundColor: cardBg, borderColor }]}
        >
          <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
            Troves DeFi Strategies
          </ThemedText>
          <View style={styles.tvlRow}>
            <ThemedText style={[styles.tvlLabel, { color: textSecondary }]}>
              Total TVL
            </ThemedText>
            {isLoadingStrategies ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <ThemedText style={styles.tvlValue}>
                {formatUsd(tvlUsd)}
              </ThemedText>
            )}
          </View>
          <View style={styles.addressRow}>
            <TouchableOpacity
              style={[styles.addressPill, { backgroundColor: borderColor }]}
              onPress={handleCopyAddress}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.addressPillText, { color: textSecondary }]}
              >
                {cropAddress(wallet.address)}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRefresh}
              hitSlop={6}
              style={[styles.refreshBtn, { backgroundColor: borderColor }]}
              disabled={isLoadingStrategies}
              activeOpacity={0.88}
            >
              {isLoadingStrategies ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Ionicons name="refresh" size={12} color={primaryColor} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {unsupportedReason ? (
          <View
            style={[
              styles.noticeCard,
              { backgroundColor: cardBg, borderColor },
            ]}
          >
            <ThemedText style={[styles.noticeText, { color: textSecondary }]}>
              {unsupportedReason}
            </ThemedText>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.searchRow,
                { backgroundColor: cardBg, borderColor },
              ]}
            >
              <Ionicons name="search" size={14} color={textSecondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search strategies by name, id, or token"
                placeholderTextColor={textSecondary}
                style={[styles.searchInput, { color: primaryColor }]}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            {isLoadingStrategies && strategies.length === 0 ? (
              <ActivityIndicator
                size="large"
                color={primaryColor}
                style={styles.loadingSpinner}
              />
            ) : filteredStrategies.length === 0 ? (
              <View
                style={[
                  styles.noticeCard,
                  { backgroundColor: cardBg, borderColor },
                ]}
              >
                <ThemedText
                  style={[styles.noticeText, { color: textSecondary }]}
                >
                  No strategies match your search.
                </ThemedText>
              </View>
            ) : (
              filteredStrategies.map((strategy) => {
                const position = positions[strategy.id] ?? null;
                const isDualAsset = strategy.depositTokens.length > 1;
                const tokenLabels = strategy.depositTokens
                  .map((t) => t.symbol)
                  .join(" / ");
                const hasPosition = position !== null;

                return (
                  <View
                    key={strategy.id}
                    style={[
                      styles.strategyCard,
                      { backgroundColor: cardBg, borderColor },
                    ]}
                  >
                    <View style={styles.strategyHeader}>
                      <View style={styles.strategyHeaderLeft}>
                        <ThemedText style={styles.strategyName}>
                          {strategy.name}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.strategyTokens,
                            { color: textSecondary },
                          ]}
                        >
                          {tokenLabels}
                          {isDualAsset ? " · LP" : ""}
                        </ThemedText>
                      </View>
                      <View style={styles.strategyMetrics}>
                        <View style={styles.strategyMetric}>
                          <ThemedText
                            style={[
                              styles.metricLabel,
                              { color: textSecondary },
                            ]}
                          >
                            APY
                          </ThemedText>
                          <ThemedText style={styles.metricValue}>
                            {formatApy(strategy)}
                          </ThemedText>
                        </View>
                        <View style={styles.strategyMetric}>
                          <ThemedText
                            style={[
                              styles.metricLabel,
                              { color: textSecondary },
                            ]}
                          >
                            TVL
                          </ThemedText>
                          <ThemedText style={styles.metricValue}>
                            {formatUsd(strategy.tvlUsd)}
                          </ThemedText>
                        </View>
                      </View>
                    </View>

                    {hasPosition ? (
                      <View
                        style={[
                          styles.positionBanner,
                          { borderColor, backgroundColor: inputBg },
                        ]}
                      >
                        <ThemedText
                          style={[styles.bannerLabel, { color: textSecondary }]}
                        >
                          Your position
                        </ThemedText>
                        <View style={styles.bannerValues}>
                          {position.amounts.map((amount, idx) => (
                            <ThemedText key={idx} style={styles.bannerValue}>
                              {formatAmount(amount)}{" "}
                              {strategy.depositTokens[idx]?.symbol ?? ""}
                            </ThemedText>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[
                          styles.primaryAction,
                          isDualAsset && styles.actionDisabled,
                        ]}
                        onPress={() => openSheet(strategy, "deposit")}
                        disabled={isDualAsset}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.primaryActionText,
                            isDualAsset
                              ? { color: primaryColor }
                              : styles.primaryActionTextEnabled,
                          ]}
                        >
                          Deposit
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.secondaryAction,
                          { borderColor },
                          (!hasPosition || isDualAsset) &&
                            styles.actionDisabled,
                        ]}
                        onPress={() => openSheet(strategy, "withdraw")}
                        disabled={!hasPosition || isDualAsset}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.secondaryActionText,
                            { color: primaryColor },
                          ]}
                        >
                          Withdraw
                        </ThemedText>
                      </TouchableOpacity>
                    </View>

                    {isDualAsset && (
                      <ThemedText
                        style={[styles.dualHint, { color: textSecondary }]}
                      >
                        Dual-asset LP strategies are read-only in this example.
                      </ThemedText>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        <ThemedText style={[styles.hint, { color: textSecondary }]}>
          Pull to refresh strategies and positions
        </ThemedText>
      </ScrollView>

      <Modal
        visible={sheetStrategy !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSheet}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">
              {sheetAction === "deposit" ? "Deposit" : "Withdraw"}
            </ThemedText>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={closeSheet}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.modalCloseText, { color: primaryColor }]}
              >
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {sheetStrategy && (
              <>
                <ThemedText
                  style={[styles.modalSubtitle, { color: textSecondary }]}
                >
                  {sheetStrategy.name} · {formatApy(sheetStrategy)} APY
                </ThemedText>

                {sheetStrategy.depositTokens.length > 1 && (
                  <View style={styles.tokenPickerRow}>
                    {sheetStrategy.depositTokens.map((t, idx) => (
                      <TouchableOpacity
                        key={t.address}
                        style={[
                          styles.tokenPickerChip,
                          {
                            borderColor,
                            backgroundColor:
                              idx === sheetTokenIndex ? borderColor : inputBg,
                          },
                        ]}
                        onPress={() => setSheetTokenIndex(idx)}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.tokenPickerText,
                            { color: primaryColor },
                          ]}
                        >
                          {t.symbol}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {sheetAction === "withdraw" && sheetPositionAmount && (
                  <ThemedText
                    style={[styles.modalHint, { color: textSecondary }]}
                  >
                    Position: {formatAmount(sheetPositionAmount)}{" "}
                    {sheetToken?.symbol}
                  </ThemedText>
                )}

                <View
                  style={[
                    styles.inputRow,
                    { borderColor, backgroundColor: inputBg },
                  ]}
                >
                  <ThemedText
                    style={[styles.inputPrefix, { color: primaryColor }]}
                  >
                    {sheetToken?.symbol ?? ""}
                  </ThemedText>
                  <TextInput
                    style={[styles.input, { color: primaryColor }]}
                    value={sheetAmount}
                    onChangeText={setSheetAmount}
                    placeholder="0.0"
                    placeholderTextColor={textSecondary}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  {sheetAction === "deposit" && sheetBalance && (
                    <TouchableOpacity
                      style={[
                        styles.maxButton,
                        { backgroundColor: borderColor },
                      ]}
                      onPress={() => setSheetAmount(sheetBalance.toUnit())}
                      activeOpacity={0.88}
                    >
                      <ThemedText
                        style={[styles.maxText, { color: primaryColor }]}
                      >
                        MAX
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                  {sheetAction === "withdraw" && sheetPositionAmount && (
                    <TouchableOpacity
                      style={[
                        styles.maxButton,
                        { backgroundColor: borderColor },
                      ]}
                      onPress={() =>
                        setSheetAmount(sheetPositionAmount.toUnit())
                      }
                      activeOpacity={0.88}
                    >
                      <ThemedText
                        style={[styles.maxText, { color: primaryColor }]}
                      >
                        MAX
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
                {sheetAction === "deposit" && (
                  <ThemedText
                    style={[styles.balanceHint, { color: textSecondary }]}
                  >
                    Wallet: {formatAmount(sheetBalance)} {sheetToken?.symbol}
                  </ThemedText>
                )}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    sheetSubmitDisabled
                      ? styles.actionDisabled
                      : styles.actionEnabled,
                  ]}
                  onPress={handleSheetSubmit}
                  disabled={sheetSubmitDisabled}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[
                      styles.submitText,
                      sheetSubmitDisabled
                        ? { color: primaryColor }
                        : styles.submitTextEnabled,
                    ]}
                  >
                    {isBusy
                      ? "Processing..."
                      : sheetAction === "deposit"
                        ? "Confirm Deposit"
                        : "Confirm Withdraw"}
                  </ThemedText>
                </TouchableOpacity>
              </>
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
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  networkPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  networkPillText: { fontSize: 11, fontWeight: "600" },
  disconnectLink: { fontSize: 13 },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  tvlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  tvlLabel: { fontSize: 12 },
  tvlValue: { fontSize: 22, fontWeight: "700" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addressPill: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  addressPillText: { fontSize: 10 },
  refreshBtn: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  noticeText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13 },
  loadingSpinner: { paddingVertical: 40 },
  strategyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  strategyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  strategyHeaderLeft: { flex: 1, minWidth: 0, paddingRight: 10 },
  strategyName: { fontSize: 15, fontWeight: "700" },
  strategyTokens: { fontSize: 11, marginTop: 2 },
  strategyMetrics: { flexDirection: "row", gap: 14 },
  strategyMetric: { alignItems: "flex-end" },
  metricLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  positionSpinner: { paddingVertical: 12 },
  positionBanner: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  bannerValues: { alignItems: "flex-end" },
  bannerValue: { fontSize: 12, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  primaryAction: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#000",
  },
  primaryActionText: { fontSize: 13, fontWeight: "600" },
  primaryActionTextEnabled: { color: "#fff" },
  secondaryAction: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  secondaryActionText: { fontSize: 13, fontWeight: "600" },
  actionEnabled: { backgroundColor: "#000" },
  actionDisabled: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    opacity: 0.6,
  },
  dualHint: { marginTop: 8, fontSize: 11, fontStyle: "italic" },
  hint: { textAlign: "center", fontSize: 12, opacity: 0.4, marginTop: 12 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modalCloseText: { fontSize: 11, fontWeight: "600" },
  modalContent: { padding: 16, gap: 12 },
  modalSubtitle: { fontSize: 13 },
  modalHint: { fontSize: 11 },
  tokenPickerRow: { flexDirection: "row", gap: 8 },
  tokenPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tokenPickerText: { fontSize: 12, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
    minHeight: 40,
  },
  inputPrefix: { fontSize: 13, fontWeight: "700" },
  input: { flex: 1, fontSize: 15, paddingVertical: 6 },
  maxButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  maxText: { fontSize: 10, fontWeight: "600" },
  balanceHint: { fontSize: 11 },
  submitButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: { fontSize: 14, fontWeight: "600" },
  submitTextEnabled: { color: "#fff" },
});
