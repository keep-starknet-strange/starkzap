import { useCallback, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ValidatorCard } from "@/components/ValidatorCard";
import { StakingPosition } from "@/components/StakingPosition";
import { AmountInput } from "@/components/AmountInput";
import { LogsFAB } from "@/components/LogsFAB";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import { useBalancesStore } from "@/stores/balances";
import {
  useStakingStore,
  getValidatorsForNetwork,
  type StakingPosition as StakingPositionType,
} from "@/stores/staking";
import type { Validator, Pool } from "x";

export default function StakingScreen() {
  const { wallet, sdk, chainId, addLog } = useWalletStore();
  const { getBalance, fetchBalances } = useBalancesStore();
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
  const [showStakeModal, setShowStakeModal] = useState(false);
  const [selectedValidatorKey, setSelectedValidatorKey] = useState<
    string | null
  >(null);
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(
    null
  );
  const [stakeAmount, setStakeAmount] = useState("");
  const [exitAmount, setExitAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const validators = getValidatorsForNetwork(chainId);
  const validatorEntries = Object.entries(validators);

  const networkName =
    NETWORKS.find((n) => n.chainId === chainId)?.name ?? "Custom";

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

  const handleRefresh = useCallback(async () => {
    if (wallet) {
      await fetchBalances(wallet, chainId);
      await loadAllPositions(wallet);
    }
  }, [wallet, chainId, fetchBalances, loadAllPositions]);

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

  const handleOpenStakeModal = useCallback(
    (key: string) => {
      setActivePosition(key);
      setStakeAmount("");
      setShowStakeModal(true);
    },
    [setActivePosition]
  );

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

  const handleStake = useCallback(async () => {
    if (!wallet || !stakeAmount || !activePositionKey) return;

    await stake(activePositionKey, wallet, stakeAmount, addLog);
    setStakeAmount("");
    setShowStakeModal(false);
    await fetchBalances(wallet, chainId);
  }, [
    wallet,
    stakeAmount,
    activePositionKey,
    chainId,
    addLog,
    stake,
    fetchBalances,
  ]);

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

  if (!wallet) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <ThemedText type="title">Staking</ThemedText>
        <View style={styles.networkBadge}>
          <ThemedText style={styles.networkBadgeText}>{networkName}</ThemedText>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingAny}
            onRefresh={handleRefresh}
            tintColor="#0a7ea4"
          />
        }
      >
        {/* Positions List */}
        {positionsList.length > 0 && (
          <>
            <ThemedText style={styles.sectionTitle}>Your Positions</ThemedText>
            {positionsList.map((positionData) => (
              <View key={positionData.key} style={styles.positionWrapper}>
                <ValidatorCard
                  validator={positionData.validator}
                  isSelected={false}
                />
                <View style={styles.tokenBadge}>
                  <ThemedText style={styles.tokenBadgeText}>
                    {positionData.token.symbol}
                  </ThemedText>
                </View>
                <StakingPosition
                  position={positionData.position}
                  isLoading={positionData.isLoading}
                  onClaimRewards={() => handleClaimRewards(positionData.key)}
                  onAddStake={
                    positionData.isMember
                      ? () => handleOpenAddStakeModal(positionData.key)
                      : undefined
                  }
                  onExitIntent={() =>
                    handleOpenExitIntentModal(positionData.key, positionData)
                  }
                  onExit={() => handleExit(positionData.key)}
                  isClaimingRewards={isClaimingRewards}
                  isExiting={isExiting}
                />
                {/* Show stake button if not a member yet */}
                {!positionData.isMember && !positionData.isLoading && (
                  <TouchableOpacity
                    style={styles.stakeButton}
                    onPress={() => handleOpenStakeModal(positionData.key)}
                  >
                    <ThemedText style={styles.stakeButtonText}>
                      Stake {positionData.token.symbol}
                    </ThemedText>
                  </TouchableOpacity>
                )}
                {/* Fallback: Show add stake button for members if position is null */}
                {positionData.isMember &&
                  !positionData.position &&
                  !positionData.isLoading && (
                    <TouchableOpacity
                      style={styles.stakeButton}
                      onPress={() => handleOpenAddStakeModal(positionData.key)}
                    >
                      <ThemedText style={styles.stakeButtonText}>
                        Add {positionData.token.symbol} Stake
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                {/* Remove button */}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removePosition(positionData.key)}
                >
                  <ThemedText style={styles.removeButtonText}>
                    Remove
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Add Position Button */}
        <ThemedText style={styles.sectionTitle}>
          {positionsList.length > 0 ? "Add Position" : "Get Started"}
        </ThemedText>
        <TouchableOpacity
          style={styles.addValidatorButton}
          onPress={() => setShowValidatorPicker(true)}
        >
          <ThemedText style={styles.addValidatorButtonText}>
            + Select Validator & Token
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.hint}>
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="title">Select Validator</ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowValidatorPicker(false)}
            >
              <ThemedText style={styles.modalCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search validators..."
              placeholderTextColor="#888"
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
              <ThemedText style={styles.emptyText}>
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="title">Select Token</ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={handleClosePoolPicker}
            >
              <ThemedText style={styles.modalCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {selectedValidator && (
              <ThemedText style={styles.modalSubtitle}>
                Choose which token to stake with {selectedValidator.name}
              </ThemedText>
            )}

            {isLoadingPools ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0a7ea4" />
                <ThemedText style={styles.loadingText}>
                  Loading available tokens...
                </ThemedText>
              </View>
            ) : !validatorPools?.pools?.length ? (
              <ThemedText style={styles.emptyText}>
                No staking pools available for this validator
              </ThemedText>
            ) : (
              <FlatList
                data={validatorPools?.pools ?? []}
                keyExtractor={(pool) => pool.poolContract}
                renderItem={({ item: pool }) => (
                  <TouchableOpacity
                    style={styles.poolCard}
                    onPress={() => handleSelectPool(pool)}
                  >
                    <View style={styles.poolInfo}>
                      <ThemedText style={styles.poolTokenSymbol}>
                        {pool.token.symbol}
                      </ThemedText>
                      <ThemedText style={styles.poolTokenName}>
                        {pool.token.name}
                      </ThemedText>
                    </View>
                    <View style={styles.poolStats}>
                      <ThemedText style={styles.poolAmount}>
                        {pool.amount.toFormatted(true)} staked
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Stake Modal (for new positions) */}
      <Modal
        visible={showStakeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStakeModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="title">
              Stake {activePosition?.token?.symbol ?? ""}
            </ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowStakeModal(false)}
            >
              <ThemedText style={styles.modalCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {activePosition?.token && (
              <>
                <ThemedText style={styles.modalSubtitle}>
                  Stake {activePosition.token.symbol} with{" "}
                  {activePosition.validator.name}
                </ThemedText>

                <AmountInput
                  value={stakeAmount}
                  onChangeText={setStakeAmount}
                  token={activePosition.token}
                  balance={getBalance(activePosition.token)}
                  label="Amount to stake"
                />

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (!stakeAmount || isStaking) && styles.buttonDisabled,
                  ]}
                  onPress={handleStake}
                  disabled={!stakeAmount || isStaking}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {isStaking ? "Processing..." : "Stake"}
                  </ThemedText>
                </TouchableOpacity>
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="title">
              Add {activePosition?.token?.symbol ?? ""}
            </ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowAddStakeModal(false)}
            >
              <ThemedText style={styles.modalCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {activePosition?.token && (
              <>
                <ThemedText style={styles.modalSubtitle}>
                  Add more {activePosition.token.symbol} to your stake with{" "}
                  {activePosition.validator.name}
                </ThemedText>

                <AmountInput
                  value={stakeAmount}
                  onChangeText={setStakeAmount}
                  token={activePosition.token}
                  balance={getBalance(activePosition.token)}
                  label="Amount to add"
                />

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (!stakeAmount || isStaking) && styles.buttonDisabled,
                  ]}
                  onPress={handleAddStake}
                  disabled={!stakeAmount || isStaking}
                >
                  <ThemedText style={styles.primaryButtonText}>
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="title">Exit Intent</ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowExitIntentModal(false)}
            >
              <ThemedText style={styles.modalCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {activePosition?.token && (
              <>
                <ThemedText style={styles.modalSubtitle}>
                  Initiate unstaking {activePosition.token.symbol} from{" "}
                  {activePosition.validator.name}. After the cooldown period,
                  you can complete the exit to receive your tokens.
                </ThemedText>

                <AmountInput
                  value={exitAmount}
                  onChangeText={setExitAmount}
                  token={activePosition.token}
                  balance={activePosition.position?.staked}
                  label="Amount to unstake"
                />

                <TouchableOpacity
                  style={[
                    styles.exitButton,
                    (!exitAmount || isExiting) && styles.buttonDisabled,
                  ]}
                  onPress={handleExitIntent}
                  disabled={!exitAmount || isExiting}
                >
                  <ThemedText style={styles.exitButtonText}>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  networkBadge: {
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  networkBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  positionWrapper: {
    marginBottom: 24,
  },
  tokenBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 1,
  },
  tokenBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  addValidatorButton: {
    padding: 20,
    backgroundColor: "rgba(10, 126, 164, 0.1)",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(10, 126, 164, 0.3)",
    borderStyle: "dashed",
    alignItems: "center",
    marginBottom: 16,
  },
  addValidatorButtonText: {
    color: "#0a7ea4",
    fontSize: 16,
    fontWeight: "600",
  },
  stakeButton: {
    backgroundColor: "#0a7ea4",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  stakeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  removeButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  removeButtonText: {
    color: "#888",
    fontSize: 14,
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    opacity: 0.4,
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#151718",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  modalCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  modalCloseText: {
    color: "#fff",
    fontWeight: "600",
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
  poolCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    marginBottom: 12,
  },
  poolInfo: {
    flex: 1,
  },
  poolTokenSymbol: {
    fontSize: 18,
    fontWeight: "600",
  },
  poolTokenName: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  poolStats: {
    alignItems: "flex-end",
  },
  poolAmount: {
    fontSize: 14,
    opacity: 0.7,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#fff",
  },
  validatorList: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.5,
    paddingVertical: 20,
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
