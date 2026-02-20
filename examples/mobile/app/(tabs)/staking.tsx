import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  View,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { usePrivy } from "@privy-io/expo";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ThemedText } from "@/components/themed-text";
import { ValidatorCard } from "@/components/ValidatorCard";
import { StakingPosition } from "@/components/StakingPosition";
import { LogsFAB } from "@/components/LogsFAB";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import {
  useBalancesStore,
  getStrkToken,
  getUsdcToken,
  getWbtcToken,
} from "@/stores/balances";
import { showCopiedToast } from "@/components/Toast";
import type { Amount, Token } from "x";

function TinyTokenLogo({ token }: { token: Token }) {
  const [imageError, setImageError] = useState(false);
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "border");
  if (!token.metadata?.logoUrl || imageError) {
    return (
      <View
        style={[
          stakingTokenLogoStyles.tinyLogo,
          stakingTokenLogoStyles.tinyLogoPlaceholder,
          { backgroundColor: borderColor },
        ]}
      >
        <ThemedText
          style={[stakingTokenLogoStyles.tinyLogoText, { color: primaryColor }]}
        >
          {token.symbol.charAt(0)}
        </ThemedText>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: token.metadata.logoUrl.toString() }}
      style={stakingTokenLogoStyles.tinyLogo}
      onError={() => setImageError(true)}
    />
  );
}

const stakingTokenLogoStyles = StyleSheet.create({
  tinyLogo: { width: 20, height: 20, borderRadius: 10 },
  tinyLogoPlaceholder: { justifyContent: "center", alignItems: "center" },
  tinyLogoText: { fontSize: 10, fontWeight: "600" },
});

const SEPOLIA_USD_RATES = { USDC: 1, STRK: 0.05, WBTC: 97000 } as const;

function formatBalanceNumber(amount: Amount): string {
  const formatted = amount.toFormatted(true);
  const partWithNumber = formatted.split(/\s+/).find((p) => /\d/.test(p));
  return partWithNumber ?? "—";
}

function parseBalanceToNumber(amount: Amount | null): number {
  if (!amount) return 0;
  const s = formatBalanceNumber(amount);
  return parseFloat(s.replace(/,/g, "")) || 0;
}

function cropAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-5)}`;
}
import {
  useStakingStore,
  getValidatorsForNetwork,
  type StakingPosition as StakingPositionType,
} from "@/stores/staking";
import type { Validator, Pool } from "starkzap";

export default function StakingScreen() {
  const {
    wallet,
    sdk,
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
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const inputBg = useThemeColor({}, "background");

  const strkToken = getStrkToken(chainId);
  const usdcToken = getUsdcToken(chainId);
  const wbtcToken = getWbtcToken(chainId);
  const strkBalance = getBalance(strkToken);
  const usdcBalance = getBalance(usdcToken);
  const wbtcBalance = getBalance(wbtcToken);
  const isSepolia =
    chainId.isSepolia?.() ?? chainId.toLiteral?.() === "SN_SEPOLIA";
  const totalUsd =
    isSepolia && (strkBalance || wbtcBalance || usdcBalance)
      ? parseBalanceToNumber(usdcBalance) * SEPOLIA_USD_RATES.USDC +
        parseBalanceToNumber(strkBalance) * SEPOLIA_USD_RATES.STRK +
        parseBalanceToNumber(wbtcBalance) * SEPOLIA_USD_RATES.WBTC
      : null;
  const {
    positions,
    validatorPools,
    activePositionKey,
    isLoadingPools,
    isStaking,
    isClaimingRewards,
    isExiting,
    fetchValidatorPools,
    addPosition,
    removePosition,
    loadAllPositions,
    setActivePosition,
    clearValidatorPools,
    stake,
    addStake,
    claimRewards,
    exitIntent,
    exit,
  } = useStakingStore();

  const [showValidatorPicker, setShowValidatorPicker] = useState(false);
  const [showPoolPicker, setShowPoolPicker] = useState(false);
  const [showAddStakeModal, setShowAddStakeModal] = useState(false);
  const [showExitIntentModal, setShowExitIntentModal] = useState(false);
  const [selectedValidatorKey, setSelectedValidatorKey] = useState<
    string | null
  >(null);
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(
    null
  );
  const [stakeAmount, setStakeAmount] = useState("");
  const [stakeAmountByKey, setStakeAmountByKey] = useState<
    Record<string, string>
  >({});
  const [exitAmount, setExitAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const setStakeAmountForKey = useCallback((key: string, value: string) => {
    setStakeAmountByKey((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validators = getValidatorsForNetwork(chainId);
  const validatorEntries = Object.entries(validators);

  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  // Get array of positions
  const positionsList = Object.values(positions);

  // Get active position data
  const activePosition = activePositionKey
    ? positions[activePositionKey]
    : null;

  // Check if any position is loading
  const isLoadingAny = positionsList.some((p) => p.isLoading);

  // Filter validators by search query
  const filteredValidators = validatorEntries.filter(([, validator]) =>
    validator.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (wallet) {
      fetchBalances(wallet, chainId);
      loadAllPositions(wallet);
    }
  }, [wallet, chainId, fetchBalances, loadAllPositions]);

  const handleRefresh = useCallback(async () => {
    if (wallet) {
      await fetchBalances(wallet, chainId);
      await loadAllPositions(wallet);
    }
  }, [wallet, chainId, fetchBalances, loadAllPositions]);

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
    if (wallet) {
      await Clipboard.setStringAsync(wallet.address);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showCopiedToast();
    }
  }, [wallet]);

  const handleSelectValidator = useCallback(
    async (key: string, validator: Validator) => {
      if (!sdk) return;
      setSelectedValidatorKey(key);
      setSelectedValidator(validator);
      setShowValidatorPicker(false);
      setSearchQuery("");

      // Fetch pools for this validator
      const pools = await fetchValidatorPools(validator, sdk);
      if (pools.length > 0) {
        setShowPoolPicker(true);
      }
    },
    [sdk, fetchValidatorPools]
  );

  const handleSelectPool = useCallback(
    async (pool: Pool) => {
      if (!wallet || !selectedValidatorKey || !selectedValidator) return;

      setShowPoolPicker(false);
      await addPosition(
        selectedValidatorKey,
        selectedValidator,
        pool,
        wallet,
        chainId
      );
      clearValidatorPools();
      setSelectedValidatorKey(null);
      setSelectedValidator(null);
    },
    [
      wallet,
      selectedValidatorKey,
      selectedValidator,
      addPosition,
      clearValidatorPools,
      chainId,
    ]
  );

  const handleClosePoolPicker = useCallback(() => {
    setShowPoolPicker(false);
    clearValidatorPools();
    setSelectedValidatorKey(null);
    setSelectedValidator(null);
  }, [clearValidatorPools]);

  const handleOpenAddStakeModal = useCallback(
    (key: string) => {
      setActivePosition(key);
      setStakeAmount("");
      setShowAddStakeModal(true);
    },
    [setActivePosition]
  );

  const handleOpenExitIntentModal = useCallback(
    (key: string, positionData: StakingPositionType) => {
      setActivePosition(key);
      if (positionData.position && !positionData.position.staked.isZero()) {
        setExitAmount(positionData.position.staked.toUnit());
      }
      setShowExitIntentModal(true);
    },
    [setActivePosition]
  );

  const handleStake = useCallback(
    async (positionKey: string, amount: string) => {
      if (!wallet || !amount?.trim()) return;

      await stake(positionKey, wallet, amount.trim(), addLog);
      setStakeAmountByKey((prev) => {
        const next = { ...prev };
        delete next[positionKey];
        return next;
      });
      await fetchBalances(wallet, chainId);
    },
    [wallet, addLog, stake, fetchBalances]
  );

  const handleAddStake = useCallback(async () => {
    if (!wallet || !stakeAmount || !activePositionKey) return;

    await addStake(activePositionKey, wallet, stakeAmount, addLog);
    setStakeAmount("");
    setShowAddStakeModal(false);
    await fetchBalances(wallet, chainId);
  }, [
    wallet,
    stakeAmount,
    activePositionKey,
    chainId,
    addLog,
    addStake,
    fetchBalances,
  ]);

  const handleClaimRewards = useCallback(
    async (key: string) => {
      if (!wallet) return;
      await claimRewards(key, wallet, addLog);
    },
    [wallet, addLog, claimRewards]
  );

  const handleExitIntent = useCallback(async () => {
    if (!wallet || !exitAmount || !activePositionKey) return;
    await exitIntent(activePositionKey, wallet, exitAmount, addLog);
    setExitAmount("");
    setShowExitIntentModal(false);
  }, [wallet, exitAmount, activePositionKey, addLog, exitIntent]);

  const handleExit = useCallback(
    async (key: string) => {
      if (!wallet) return;
      await exit(key, wallet, addLog);
      await fetchBalances(wallet, chainId);
    },
    [wallet, chainId, addLog, exit, fetchBalances]
  );

  const handleRemovePosition = useCallback(
    (key: string) => {
      setStakeAmountByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      removePosition(key);
    },
    [removePosition]
  );

  if (!wallet) {
    return null;
  }

  const contentPaddingTop = 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentPaddingTop },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingBalances || isLoadingAny}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <ThemedText type="title">Staking</ThemedText>
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

        {/* Single card: Total (USD) + Get started or Your Positions + Add Position at bottom */}
        <View
          style={[
            styles.stakingTopCard,
            { backgroundColor: cardBg, borderColor },
          ]}
        >
          <View style={styles.usdTotalHeaderRow}>
            <ThemedText
              style={[styles.usdTotalLabel, { color: textSecondary }]}
            >
              Total (USD)
            </ThemedText>
          </View>
          <View style={styles.usdTotalAmountWrap}>
            {isLoadingBalances ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : totalUsd != null ? (
              <ThemedText style={styles.usdTotalAmount}>
                $
                {totalUsd.toLocaleString("default", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </ThemedText>
            ) : (
              <ThemedText
                style={[styles.usdTotalAmount, { color: textSecondary }]}
              >
                —
              </ThemedText>
            )}
          </View>
          <View style={styles.addressCopyRow}>
            <TouchableOpacity
              style={[styles.addressCopyBtn, { backgroundColor: borderColor }]}
              onPress={handleCopyAddress}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.addressCopyBtnText, { color: textSecondary }]}
              >
                {wallet ? cropAddress(wallet.address) : ""}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRefresh}
              hitSlop={6}
              style={[styles.refreshBtn, { backgroundColor: borderColor }]}
              disabled={isLoadingBalances}
              activeOpacity={0.88}
            >
              {isLoadingBalances ? (
                <ActivityIndicator
                  size="small"
                  color={primaryColor}
                  style={styles.refreshBtnSpinner}
                />
              ) : (
                <Ionicons name="refresh" size={12} color={primaryColor} />
              )}
            </TouchableOpacity>
          </View>
          <View
            style={[
              styles.balanceCardDivider,
              { backgroundColor: borderColor },
            ]}
          />

          {positionsList.length === 0 ? (
            /* Get started - no positions */
            <View style={styles.stakingCardSection}>
              <View style={styles.usdTotalHeaderRow}>
                <ThemedText
                  style={[
                    styles.usdTotalLabel,
                    styles.getStartedTitle,
                    { color: textSecondary },
                  ]}
                >
                  Get Started
                </ThemedText>
              </View>
              <TouchableOpacity
                style={[styles.addValidatorButton, { borderColor }]}
                onPress={() => setShowValidatorPicker(true)}
                activeOpacity={0.88}
              >
                <ThemedText
                  style={[
                    styles.addValidatorButtonText,
                    { color: primaryColor },
                  ]}
                >
                  + Select Validator & Token
                </ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.positionsListWrap}>
                {/* Your Positions - same formatting as Total (USD) */}
                <View style={styles.usdTotalHeaderRow}>
                  <ThemedText
                    style={[styles.usdTotalLabel, { color: textSecondary }]}
                  >
                    Your Positions
                  </ThemedText>
                </View>
                {positionsList.map((positionData) => {
                  const hasOpenPosition =
                    positionData.position &&
                    !positionData.position.staked.isZero();
                  return (
                    <View
                      key={positionData.key}
                      style={[
                        styles.positionRow,
                        { backgroundColor: borderColor },
                      ]}
                    >
                      {/* When open position: validator only. Otherwise: validator | token + amount + MAX */}
                      {hasOpenPosition ? (
                        <View style={styles.positionValidatorWrapStandalone}>
                          <ValidatorCard
                            validator={positionData.validator}
                            isSelected={false}
                            compact
                            containerStyle={{
                              backgroundColor: cardBg,
                              borderColor,
                            }}
                          />
                        </View>
                      ) : (
                        <View style={styles.positionRowOneLine}>
                          <View style={styles.positionValidatorWrap}>
                            <ValidatorCard
                              validator={positionData.validator}
                              isSelected={false}
                              compact
                              containerStyle={{
                                backgroundColor: cardBg,
                                borderColor,
                              }}
                            />
                          </View>
                          <View
                            style={[
                              styles.amountTokenRowInline,
                              {
                                backgroundColor: inputBg,
                                borderWidth: 1,
                                borderColor,
                              },
                            ]}
                          >
                            <View style={styles.stakeTokenDisplay}>
                              <TinyTokenLogo token={positionData.token} />
                              <ThemedText
                                style={[
                                  styles.amountTokenSymbol,
                                  { color: primaryColor },
                                ]}
                              >
                                {positionData.token.symbol}
                              </ThemedText>
                            </View>
                            <View style={styles.amountInputMaxWrap}>
                              <TextInput
                                style={[
                                  styles.amountInput,
                                  { color: primaryColor },
                                ]}
                                value={stakeAmountByKey[positionData.key] ?? ""}
                                onChangeText={(amount) =>
                                  setStakeAmountForKey(positionData.key, amount)
                                }
                                placeholder="0.0"
                                placeholderTextColor={textSecondary}
                                keyboardType="decimal-pad"
                              />
                              {getBalance(positionData.token) && (
                                <TouchableOpacity
                                  style={[
                                    styles.maxButton,
                                    { backgroundColor: borderColor },
                                  ]}
                                  onPress={() =>
                                    setStakeAmountForKey(
                                      positionData.key,
                                      getBalance(positionData.token)!.toUnit()
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
                          </View>
                        </View>
                      )}
                      {hasOpenPosition && (
                        <StakingPosition
                          position={positionData.position}
                          isLoading={positionData.isLoading}
                          onClaimRewards={() =>
                            handleClaimRewards(positionData.key)
                          }
                          onAddStake={
                            positionData.isMember
                              ? () => handleOpenAddStakeModal(positionData.key)
                              : undefined
                          }
                          onExitIntent={() =>
                            handleOpenExitIntentModal(
                              positionData.key,
                              positionData
                            )
                          }
                          onExit={() => handleExit(positionData.key)}
                          isClaimingRewards={isClaimingRewards}
                          isExiting={isExiting}
                        />
                      )}
                      {!hasOpenPosition && (
                        <View style={styles.stakeAndCloseRow}>
                          {!positionData.isMember &&
                            !positionData.isLoading &&
                            (() => {
                              const stakeDisabled =
                                !(
                                  stakeAmountByKey[positionData.key] ?? ""
                                ).trim() || isStaking;
                              return (
                                <TouchableOpacity
                                  style={[
                                    styles.stakeButton,
                                    styles.stakeButtonInRow,
                                    stakeDisabled
                                      ? { backgroundColor: "#fff" }
                                      : { backgroundColor: "#000" },
                                  ]}
                                  onPress={() =>
                                    handleStake(
                                      positionData.key,
                                      stakeAmountByKey[positionData.key] ?? ""
                                    )
                                  }
                                  disabled={stakeDisabled}
                                  activeOpacity={0.88}
                                >
                                  <ThemedText
                                    style={[
                                      styles.stakeButtonTextLikeAddValidator,
                                      stakeDisabled
                                        ? { color: primaryColor }
                                        : { color: "#fff" },
                                    ]}
                                  >
                                    {isStaking
                                      ? "Processing..."
                                      : stakeDisabled
                                        ? "Select token first"
                                        : `Stake ${positionData.token.symbol}`}
                                  </ThemedText>
                                </TouchableOpacity>
                              );
                            })()}
                          {positionData.isMember &&
                            !positionData.position &&
                            !positionData.isLoading && (
                              <TouchableOpacity
                                style={[
                                  styles.stakeButton,
                                  styles.stakeButtonInRow,
                                ]}
                                onPress={() =>
                                  handleOpenAddStakeModal(positionData.key)
                                }
                                activeOpacity={0.88}
                              >
                                <ThemedText
                                  style={[
                                    styles.stakeButtonTextLikeAddValidator,
                                    { color: "#fff" },
                                  ]}
                                >
                                  Add {positionData.token.symbol} Stake
                                </ThemedText>
                              </TouchableOpacity>
                            )}
                          <TouchableOpacity
                            style={styles.positionCloseButton}
                            onPress={() =>
                              handleRemovePosition(positionData.key)
                            }
                            activeOpacity={0.88}
                          >
                            <ThemedText style={styles.positionCloseButtonText}>
                              Close
                            </ThemedText>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
                <View
                  style={[
                    styles.balanceCardDivider,
                    { backgroundColor: borderColor },
                  ]}
                />
              </View>
              {/* Add Position at bottom of card - same formatting as Total (USD) */}
              <View style={styles.stakingCardSection}>
                <View style={styles.usdTotalHeaderRow}>
                  <ThemedText
                    style={[styles.usdTotalLabel, { color: textSecondary }]}
                  >
                    Add Position
                  </ThemedText>
                </View>
                <TouchableOpacity
                  style={[styles.addValidatorButton, { borderColor }]}
                  onPress={() => setShowValidatorPicker(true)}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[
                      styles.addValidatorButtonText,
                      { color: primaryColor },
                    ]}
                  >
                    + Select Validator & Token
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <ThemedText style={[styles.hint, { color: textSecondary }]}>
          Pull down to refresh positions
        </ThemedText>
      </ScrollView>

      {/* Validator Picker Modal */}
      <Modal
        visible={showValidatorPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowValidatorPicker(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">Select Validator</ThemedText>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={() => setShowValidatorPicker(false)}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.modalCloseText, { color: primaryColor }]}
              >
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={[
                styles.searchInput,
                { backgroundColor: borderColor, color: primaryColor },
              ]}
              placeholder="Search validators..."
              placeholderTextColor={textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filteredValidators}
            keyExtractor={([key]) => key}
            contentContainerStyle={styles.validatorList}
            renderItem={({ item: [key, validator] }) => (
              <ValidatorCard
                validator={validator}
                isSelected={false}
                onSelect={() => handleSelectValidator(key, validator)}
              />
            )}
            ListEmptyComponent={
              <ThemedText style={[styles.emptyText, { color: textSecondary }]}>
                No validators found
              </ThemedText>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Pool/Token Picker Modal */}
      <Modal
        visible={showPoolPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClosePoolPicker}
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
              onPress={handleClosePoolPicker}
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
            {selectedValidator && (
              <ThemedText
                style={[styles.modalSubtitle, { color: textSecondary }]}
              >
                Choose which token to stake with {selectedValidator.name}
              </ThemedText>
            )}

            {isLoadingPools ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={primaryColor} />
                <ThemedText
                  style={[styles.loadingText, { color: textSecondary }]}
                >
                  Loading available tokens...
                </ThemedText>
              </View>
            ) : !validatorPools?.pools?.length ? (
              <ThemedText style={[styles.emptyText, { color: textSecondary }]}>
                No staking pools available for this validator
              </ThemedText>
            ) : (
              <>
                <View style={[styles.poolColumnHeader, { borderColor }]}>
                  <ThemedText
                    style={[styles.poolColumnLabel, { color: textSecondary }]}
                  >
                    Token
                  </ThemedText>
                  <ThemedText
                    style={[styles.poolColumnLabel, { color: textSecondary }]}
                  >
                    Staked
                  </ThemedText>
                </View>
                <FlatList
                  data={validatorPools?.pools ?? []}
                  keyExtractor={(pool) => pool.poolContract}
                  renderItem={({ item: pool }) => (
                    <TouchableOpacity
                      style={[
                        styles.poolCard,
                        { backgroundColor: inputBg, borderColor },
                      ]}
                      onPress={() => handleSelectPool(pool)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.poolRowLeft}>
                        <TinyTokenLogo token={pool.token} />
                        <View style={styles.poolTokenStack}>
                          <ThemedText
                            style={[
                              styles.poolTokenSymbol,
                              { color: primaryColor },
                            ]}
                          >
                            {pool.token.symbol}
                          </ThemedText>
                          <ThemedText
                            style={[
                              styles.poolTokenName,
                              { color: textSecondary },
                            ]}
                          >
                            {pool.token.name}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.poolRowRight}>
                        <ThemedText
                          style={[styles.poolAmount, { color: primaryColor }]}
                        >
                          {(() => {
                            const n = parseFloat(pool.amount.toUnit());
                            return Number.isNaN(n)
                              ? "—"
                              : Math.round(n).toLocaleString("default", {
                                  maximumFractionDigits: 0,
                                  minimumFractionDigits: 0,
                                });
                          })()}
                        </ThemedText>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Add Stake Modal */}
      <Modal
        visible={showAddStakeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddStakeModal(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">
              Add {activePosition?.token?.symbol ?? ""}
            </ThemedText>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={() => setShowAddStakeModal(false)}
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
            {activePosition?.token && (
              <>
                <ThemedText
                  style={[styles.modalSubtitle, { color: textSecondary }]}
                >
                  Add more {activePosition.token.symbol} to your stake with{" "}
                  {activePosition.validator.name}
                </ThemedText>

                <View
                  style={[
                    styles.amountTokenRow,
                    {
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 6,
                    },
                  ]}
                >
                  <View style={styles.stakeTokenDisplay}>
                    <TinyTokenLogo token={activePosition.token} />
                    <ThemedText
                      style={[
                        styles.amountTokenSymbol,
                        { color: primaryColor },
                      ]}
                    >
                      {activePosition.token.symbol}
                    </ThemedText>
                  </View>
                  <View style={styles.amountInputMaxWrap}>
                    <TextInput
                      style={[styles.amountInput, { color: primaryColor }]}
                      value={stakeAmount}
                      onChangeText={setStakeAmount}
                      placeholder="0.0"
                      placeholderTextColor={textSecondary}
                      keyboardType="decimal-pad"
                    />
                    {getBalance(activePosition.token) && (
                      <TouchableOpacity
                        style={[
                          styles.maxButton,
                          { backgroundColor: borderColor },
                        ]}
                        onPress={() =>
                          setStakeAmount(
                            getBalance(activePosition.token)!.toUnit()
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
                </View>

                <TouchableOpacity
                  style={[
                    styles.addStakeModalButton,
                    (!stakeAmount || isStaking) && styles.buttonDisabled,
                  ]}
                  onPress={handleAddStake}
                  disabled={!stakeAmount || isStaking}
                >
                  <ThemedText style={styles.addStakeModalButtonText}>
                    {isStaking ? "Processing..." : "Add Stake"}
                  </ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Exit Intent Modal */}
      <Modal
        visible={showExitIntentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExitIntentModal(false)}
      >
        <SafeAreaView
          style={[styles.modalContainer, { backgroundColor: cardBg }]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: borderColor }]}
          >
            <ThemedText type="title">Exit Intent</ThemedText>
            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                { backgroundColor: borderColor },
              ]}
              onPress={() => setShowExitIntentModal(false)}
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
            {activePosition?.token && (
              <>
                <ThemedText
                  style={[styles.modalSubtitle, { color: textSecondary }]}
                >
                  Initiate unstaking {activePosition.token.symbol} from{" "}
                  {activePosition.validator.name}. After the cooldown period,
                  you can complete the exit to receive your tokens.
                </ThemedText>

                <View
                  style={[
                    styles.amountTokenRow,
                    {
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 6,
                    },
                  ]}
                >
                  <View style={styles.stakeTokenDisplay}>
                    <TinyTokenLogo token={activePosition.token} />
                    <ThemedText
                      style={[
                        styles.amountTokenSymbol,
                        { color: primaryColor },
                      ]}
                    >
                      {activePosition.token.symbol}
                    </ThemedText>
                  </View>
                  <View style={styles.amountInputMaxWrap}>
                    <TextInput
                      style={[styles.amountInput, { color: primaryColor }]}
                      value={exitAmount}
                      onChangeText={setExitAmount}
                      placeholder="0.0"
                      placeholderTextColor={textSecondary}
                      keyboardType="decimal-pad"
                    />
                    {activePosition.position?.staked && (
                      <TouchableOpacity
                        style={[
                          styles.maxButton,
                          { backgroundColor: borderColor },
                        ]}
                        onPress={() =>
                          setExitAmount(
                            activePosition.position!.staked.toUnit()
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
                </View>

                <TouchableOpacity
                  style={[
                    styles.addStakeModalButton,
                    (!exitAmount || isExiting) && styles.buttonDisabled,
                  ]}
                  onPress={handleExitIntent}
                  disabled={!exitAmount || isExiting}
                >
                  <ThemedText style={styles.addStakeModalButtonText}>
                    {isExiting ? "Processing..." : "Submit Exit Intent"}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    width: "100%",
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 120,
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  stakingTopCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    paddingTop: 8,
    marginBottom: 12,
    alignSelf: "stretch",
    width: "100%",
    alignItems: "stretch",
  },
  usdTotalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  usdTotalLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 14,
  },
  usdTotalAmountWrap: {
    height: 34,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
  },
  usdTotalAmount: {
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 34,
  },
  addressCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  addressCopyBtn: {
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  addressCopyBtnText: {
    fontSize: 10,
  },
  refreshBtn: {
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtnSpinner: {
    margin: 0,
  },
  balanceCardDivider: {
    height: 1,
    width: "100%",
    marginVertical: 12,
  },
  stakingCardSection: {
    alignSelf: "stretch",
    width: "100%",
  },
  sectionTitleInCard: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  getStartedTitle: {
    fontWeight: "400",
  },
  sectionTitle: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  positionsListWrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  positionRow: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    overflow: "visible",
  },
  positionRowOneLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  positionValidatorWrap: {
    width: "40%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  positionValidatorWrapStandalone: {
    width: "100%",
    marginBottom: 8,
  },
  amountTokenRowInline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 6,
    minHeight: 34,
    minWidth: 0,
    alignSelf: "stretch",
  },
  removeIconTopRight: {
    position: "absolute",
    top: -4,
    right: -4,
    zIndex: 1,
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  stakeAndCloseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    alignSelf: "stretch",
  },
  stakeButtonInRow: {
    flex: 1,
    marginTop: 0,
    paddingVertical: 4,
    borderRadius: 6,
  },
  positionCloseButtonWrap: {
    alignItems: "center",
    marginTop: 10,
  },
  positionCloseButton: {
    backgroundColor: "#000",
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  positionCloseButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  addValidatorButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addValidatorButtonText: {
    fontSize: 12,
    fontWeight: "400",
  },
  stakeAmountField: {
    marginTop: 12,
    marginBottom: 4,
    alignSelf: "stretch",
    width: "100%",
  },
  amountLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  balanceLabel: {
    fontSize: 11,
  },
  amountTokenRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    gap: 6,
    minHeight: 32,
  },
  stakeTokenDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 2,
    flexShrink: 0,
  },
  amountTokenSymbol: {
    fontSize: 12,
    fontWeight: "700",
  },
  amountInputMaxWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 14,
    minWidth: 0,
  },
  maxButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  maxButtonText: {
    fontSize: 10,
    fontWeight: "600",
  },
  stakeButton: {
    backgroundColor: "#000",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  stakeButtonDisabled: {
    opacity: 0.5,
  },
  stakeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  stakeButtonTextLikeAddValidator: {
    fontSize: 12,
    fontWeight: "400",
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    opacity: 0.4,
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
  },
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
  modalCloseText: {
    fontWeight: "600",
    fontSize: 11,
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },
  modalSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 16,
  },
  loadingText: {
    opacity: 0.6,
  },
  poolColumnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  poolColumnLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  poolCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  poolRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  poolTokenStack: {
    gap: 2,
  },
  poolTokenSymbol: {
    fontSize: 15,
    fontWeight: "700",
  },
  poolTokenName: {
    fontSize: 13,
    marginTop: 0,
  },
  poolRowRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  poolAmount: {
    fontSize: 13,
    fontWeight: "500",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  validatorList: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 11,
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  addStakeModalButton: {
    backgroundColor: "#000",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  addStakeModalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  exitButton: {
    backgroundColor: "#dc3545",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  exitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
