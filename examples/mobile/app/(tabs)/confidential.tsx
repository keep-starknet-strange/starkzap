import { useCallback, useState } from "react";
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  View,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { usePrivy } from "@privy-io/expo";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ThemedText } from "@/components/themed-text";
import { LogsFAB } from "@/components/LogsFAB";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import { useBalancesStore } from "@/stores/balances";
import { showCopiedToast } from "@/components/Toast";
import {
  TongoConfidential,
  Amount,
  RpcProvider,
  fromAddress,
} from "@starkzap/native";
import type { ConfidentialState } from "@starkzap/native";
import type { ChainId } from "@starkzap/native";

// Tongo contract addresses per token
// Full list: https://docs.tongo.cash/protocol/contracts.html
interface TongoToken {
  symbol: string;
  address: string;
  decimals: number;
}

const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  ETH: 18,
  DAI: 18,
  USDC: 6,
  "USDC.e": 6,
  USDT: 6,
  WBTC: 8,
};

const TONGO_CONTRACTS_SEPOLIA: Record<string, string> = {
  STRK: "0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed",
  ETH: "0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5",
  USDC: "0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552",
  WBTC: "0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e",
};
const TONGO_CONTRACTS_MAINNET: Record<string, string> = {
  STRK: "0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498",
  ETH: "0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89",
  WBTC: "0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27",
  "USDC.e": "0x72098b84989a45cc00697431dfba300f1f5d144ae916e98287418af4e548d96",
  USDC: "0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a",
  USDT: "0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0",
  DAI: "0x511741b1ad1777b4ad59fbff49d64b8eb188e2aeb4fc72438278a589d8a10d8",
};

function getTongoContracts(chainId: ChainId): TongoToken[] {
  const map = chainId.isSepolia()
    ? TONGO_CONTRACTS_SEPOLIA
    : TONGO_CONTRACTS_MAINNET;
  return Object.entries(map).map(([symbol, address]) => ({
    symbol,
    address,
    decimals: TOKEN_DECIMALS[symbol] ?? 18,
  }));
}

function cropAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-5)}`;
}

export default function ConfidentialScreen() {
  const {
    wallet,
    chainId,
    addLog,
    rpcUrl,
    privateKey: walletPrivateKey,
    walletType,
    disconnect,
    resetNetworkConfig,
  } = useWalletStore();
  const { logout } = usePrivy();
  const { clearBalances } = useBalancesStore();

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");

  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const tongoContracts = getTongoContracts(chainId);

  // Setup state
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(0);
  const [confidential, setConfidential] = useState<TongoConfidential | null>(
    null
  );
  const [confState, setConfState] = useState<ConfidentialState | null>(null);
  const [balanceDisplay, setBalanceDisplay] = useState("--");
  const [pendingDisplay, setPendingDisplay] = useState("--");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Operation inputs
  const [fundAmount, setFundAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToX, setTransferToX] = useState("");
  const [transferToY, setTransferToY] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [ragequitTo, setRagequitTo] = useState("");

  // Loading states
  const [isFunding, setIsFunding] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [isRagequitting, setIsRagequitting] = useState(false);

  const handleDisconnect = useCallback(async () => {
    clearBalances();
    if (walletType === "privy") {
      await logout();
    }
    disconnect();
    resetNetworkConfig();
    router.replace("/");
  }, [clearBalances, disconnect, resetNetworkConfig, walletType, logout]);

  const handleInitialize = useCallback(async () => {
    const selected = tongoContracts[selectedTokenIdx];
    if (!walletPrivateKey.trim() || !selected) {
      addLog("Tongo requires a private-key wallet");
      return;
    }

    setIsInitializing(true);
    addLog(`Initializing Tongo for ${selected.symbol}...`);

    try {
      const rpcProvider = new RpcProvider({ nodeUrl: rpcUrl });
      const tongo = new TongoConfidential({
        privateKey: walletPrivateKey.trim(),
        contractAddress: fromAddress(selected.address),
        provider: rpcProvider,
      });

      setConfidential(tongo);
      addLog(`Tongo address: ${tongo.address}`);

      const state = await tongo.getState();
      setConfState(state);

      // Convert tongo units to human-readable ERC20 amounts
      const balErc20 = await tongo.toPublicUnits(state.balance);
      const pendErc20 = await tongo.toPublicUnits(state.pending);
      const { symbol: sym, decimals } = selected;
      const balFmt = Amount.fromRaw(balErc20, decimals, sym).toFormatted();
      const pendFmt = Amount.fromRaw(pendErc20, decimals, sym).toFormatted();
      setBalanceDisplay(balFmt);
      setPendingDisplay(pendFmt);

      addLog(
        `State loaded - Balance: ${balFmt}, Pending: ${pendFmt}, Nonce: ${state.nonce}`
      );
    } catch (err) {
      addLog(`Initialization failed: ${String(err)}`);
    } finally {
      setIsInitializing(false);
    }
  }, [walletPrivateKey, selectedTokenIdx, tongoContracts, rpcUrl, addLog]);

  const handleRefreshState = useCallback(async () => {
    if (!confidential) return;
    setIsRefreshing(true);
    try {
      const state = await confidential.getState();
      setConfState(state);

      const balErc20 = await confidential.toPublicUnits(state.balance);
      const pendErc20 = await confidential.toPublicUnits(state.pending);
      const selected = tongoContracts[selectedTokenIdx];
      const balFmt = Amount.fromRaw(
        balErc20,
        selected?.decimals ?? 18,
        selected?.symbol
      ).toFormatted();
      const pendFmt = Amount.fromRaw(
        pendErc20,
        selected?.decimals ?? 18,
        selected?.symbol
      ).toFormatted();
      setBalanceDisplay(balFmt);
      setPendingDisplay(pendFmt);

      addLog(
        `State refreshed - Balance: ${balFmt}, Pending: ${pendFmt}, Nonce: ${state.nonce}`
      );
    } catch (err) {
      addLog(`Refresh failed: ${String(err)}`);
    } finally {
      setIsRefreshing(false);
    }
  }, [confidential, tongoContracts, selectedTokenIdx, addLog]);

  const handleFund = useCallback(async () => {
    if (!wallet || !confidential || !fundAmount.trim()) return;
    setIsFunding(true);
    addLog(`Funding confidential account with ${fundAmount}...`);
    try {
      const selected = tongoContracts[selectedTokenIdx];
      const amount = Amount.parse(fundAmount.trim(), selected?.decimals ?? 18);
      const tx = await wallet
        .tx()
        .confidentialFund(confidential, {
          amount,
          sender: fromAddress(wallet.address),
        })
        .send();
      addLog(`Fund tx submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      addLog("Fund confirmed!");
      setFundAmount("");
      await handleRefreshState();
    } catch (err) {
      addLog(`Fund failed: ${String(err)}`);
    } finally {
      setIsFunding(false);
    }
  }, [
    wallet,
    confidential,
    fundAmount,
    tongoContracts,
    selectedTokenIdx,
    addLog,
    handleRefreshState,
  ]);

  const handleTransfer = useCallback(async () => {
    if (
      !wallet ||
      !confidential ||
      !transferAmount.trim() ||
      !transferToX.trim() ||
      !transferToY.trim()
    )
      return;
    setIsTransferring(true);
    addLog(`Confidential transfer of ${transferAmount}...`);
    try {
      const selected = tongoContracts[selectedTokenIdx];
      const amount = Amount.parse(
        transferAmount.trim(),
        selected?.decimals ?? 18
      );
      const tx = await wallet
        .tx()
        .confidentialTransfer(confidential, {
          amount,
          to: { x: transferToX.trim(), y: transferToY.trim() },
          sender: fromAddress(wallet.address),
        })
        .send();
      addLog(`Transfer tx submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      addLog("Confidential transfer confirmed!");
      setTransferAmount("");
      setTransferToX("");
      setTransferToY("");
      await handleRefreshState();
    } catch (err) {
      addLog(`Transfer failed: ${String(err)}`);
    } finally {
      setIsTransferring(false);
    }
  }, [
    wallet,
    confidential,
    transferAmount,
    transferToX,
    transferToY,
    tongoContracts,
    selectedTokenIdx,
    addLog,
    handleRefreshState,
  ]);

  const handleWithdraw = useCallback(async () => {
    if (
      !wallet ||
      !confidential ||
      !withdrawAmount.trim() ||
      !withdrawTo.trim()
    )
      return;
    setIsWithdrawing(true);
    addLog(`Withdrawing ${withdrawAmount} from confidential account...`);
    try {
      const selected = tongoContracts[selectedTokenIdx];
      const amount = Amount.parse(
        withdrawAmount.trim(),
        selected?.decimals ?? 18
      );
      const tx = await wallet
        .tx()
        .confidentialWithdraw(confidential, {
          amount,
          to: fromAddress(withdrawTo.trim()),
          sender: fromAddress(wallet.address),
        })
        .send();
      addLog(`Withdraw tx submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      addLog("Withdraw confirmed!");
      setWithdrawAmount("");
      setWithdrawTo("");
      await handleRefreshState();
    } catch (err) {
      addLog(`Withdraw failed: ${String(err)}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [
    wallet,
    confidential,
    withdrawAmount,
    withdrawTo,
    tongoContracts,
    selectedTokenIdx,
    addLog,
    handleRefreshState,
  ]);

  const handleRollover = useCallback(async () => {
    if (!wallet || !confidential) return;
    setIsRolling(true);
    addLog("Rolling over pending balance...");
    try {
      const calls = await confidential.rollover({
        sender: fromAddress(wallet.address),
      });
      const tx = await wallet.execute(calls);
      addLog(`Rollover tx submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      addLog("Rollover confirmed!");
      await handleRefreshState();
    } catch (err) {
      addLog(`Rollover failed: ${String(err)}`);
    } finally {
      setIsRolling(false);
    }
  }, [wallet, confidential, addLog, handleRefreshState]);

  const handleRagequit = useCallback(async () => {
    if (!wallet || !confidential || !ragequitTo.trim()) return;
    setIsRagequitting(true);
    addLog("Executing ragequit...");
    try {
      const calls = await confidential.ragequit({
        to: fromAddress(ragequitTo.trim()),
        sender: fromAddress(wallet.address),
      });
      const tx = await wallet.execute(calls);
      addLog(`Ragequit tx submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      addLog("Ragequit confirmed!");
      setRagequitTo("");
      await handleRefreshState();
    } catch (err) {
      addLog(`Ragequit failed: ${String(err)}`);
    } finally {
      setIsRagequitting(false);
    }
  }, [wallet, confidential, ragequitTo, addLog, handleRefreshState]);

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
            refreshing={isRefreshing}
            onRefresh={handleRefreshState}
            tintColor={primaryColor}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <ThemedText type="title">Confidential</ThemedText>
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

        {/* Setup Card */}
        {!confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
              Token
            </ThemedText>
            <View style={[styles.tokenPickerRow, { borderColor }]}>
              {tongoContracts.map((item, idx) => (
                <TouchableOpacity
                  key={item.symbol}
                  style={[
                    styles.tokenPickerChip,
                    idx === selectedTokenIdx
                      ? { backgroundColor: primaryColor }
                      : { backgroundColor: borderColor },
                  ]}
                  onPress={() => setSelectedTokenIdx(idx)}
                  activeOpacity={0.85}
                >
                  <ThemedText
                    style={[
                      styles.tokenPickerChipText,
                      {
                        color: idx === selectedTokenIdx ? "#fff" : primaryColor,
                      },
                    ]}
                  >
                    {item.symbol}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.setupButtonRow}>
              <TouchableOpacity
                style={[
                  styles.setupButton,
                  { backgroundColor: "#000" },
                  (!walletPrivateKey.trim() || isInitializing) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleInitialize}
                disabled={!walletPrivateKey.trim() || isInitializing}
                activeOpacity={0.85}
              >
                {isInitializing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText
                    style={[styles.setupButtonText, { color: "#fff" }]}
                  >
                    Initialize
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* State Card */}
        {confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.stateHeaderRow}>
              <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
                Account State
              </ThemedText>
              <TouchableOpacity
                onPress={handleRefreshState}
                hitSlop={6}
                style={[styles.refreshBtn, { backgroundColor: borderColor }]}
                disabled={isRefreshing}
                activeOpacity={0.88}
              >
                {isRefreshing ? (
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

            <View style={styles.stateRow}>
              <ThemedText style={[styles.stateLabel, { color: textSecondary }]}>
                Address
              </ThemedText>
              <TouchableOpacity
                onPress={async () => {
                  await Clipboard.setStringAsync(confidential.address);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  showCopiedToast();
                }}
                activeOpacity={0.88}
              >
                <ThemedText
                  style={[styles.stateValue, { color: primaryColor }]}
                >
                  {cropAddress(confidential.address)}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.stateRow}>
              <ThemedText style={[styles.stateLabel, { color: textSecondary }]}>
                Active Balance
              </ThemedText>
              <ThemedText style={[styles.stateValue, { color: primaryColor }]}>
                {balanceDisplay}
              </ThemedText>
            </View>

            <View style={styles.stateRow}>
              <ThemedText style={[styles.stateLabel, { color: textSecondary }]}>
                Pending Balance
              </ThemedText>
              <ThemedText style={[styles.stateValue, { color: primaryColor }]}>
                {pendingDisplay}
              </ThemedText>
            </View>

            <View style={styles.stateRow}>
              <ThemedText style={[styles.stateLabel, { color: textSecondary }]}>
                Nonce
              </ThemedText>
              <ThemedText style={[styles.stateValue, { color: primaryColor }]}>
                {confState ? confState.nonce.toString() : "--"}
              </ThemedText>
            </View>
          </View>
        )}

        {/* Fund Card */}
        {confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
              Fund
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                },
              ]}
              value={fundAmount}
              onChangeText={setFundAmount}
              placeholder="Amount"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[
                styles.actionButton,
                (!fundAmount.trim() || isFunding) && styles.buttonDisabled,
              ]}
              onPress={handleFund}
              disabled={!fundAmount.trim() || isFunding}
              activeOpacity={0.85}
            >
              {isFunding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.actionButtonText}>Fund</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Transfer Card */}
        {confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
              Transfer
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                },
              ]}
              value={transferToX}
              onChangeText={setTransferToX}
              placeholder="Recipient X"
              placeholderTextColor={textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                  marginTop: 8,
                },
              ]}
              value={transferToY}
              onChangeText={setTransferToY}
              placeholder="Recipient Y"
              placeholderTextColor={textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                  marginTop: 8,
                },
              ]}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Amount"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[
                styles.actionButton,
                (!transferAmount.trim() ||
                  !transferToX.trim() ||
                  !transferToY.trim() ||
                  isTransferring) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleTransfer}
              disabled={
                !transferAmount.trim() ||
                !transferToX.trim() ||
                !transferToY.trim() ||
                isTransferring
              }
              activeOpacity={0.85}
            >
              {isTransferring ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.actionButtonText}>
                  Transfer
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Withdraw Card */}
        {confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
              Withdraw
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                },
              ]}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              placeholder="Amount"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                  marginTop: 8,
                },
              ]}
              value={withdrawTo}
              onChangeText={setWithdrawTo}
              placeholder="To Address (0x...)"
              placeholderTextColor={textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.actionButton,
                (!withdrawAmount.trim() ||
                  !withdrawTo.trim() ||
                  isWithdrawing) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleWithdraw}
              disabled={
                !withdrawAmount.trim() || !withdrawTo.trim() || isWithdrawing
              }
              activeOpacity={0.85}
            >
              {isWithdrawing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.actionButtonText}>
                  Withdraw
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Rollover Card */}
        {confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
              Rollover
            </ThemedText>
            <ThemedText style={[styles.hintText, { color: textSecondary }]}>
              Activate pending balance into active balance.
            </ThemedText>
            <TouchableOpacity
              style={[styles.actionButton, isRolling && styles.buttonDisabled]}
              onPress={handleRollover}
              disabled={isRolling}
              activeOpacity={0.85}
            >
              {isRolling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.actionButtonText}>
                  Rollover
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Ragequit Card */}
        {confidential && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
              Ragequit
            </ThemedText>
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor,
                  color: primaryColor,
                },
              ]}
              value={ragequitTo}
              onChangeText={setRagequitTo}
              placeholder="To Address (0x...)"
              placeholderTextColor={textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.ragequitButton,
                (!ragequitTo.trim() || isRagequitting) && styles.buttonDisabled,
              ]}
              onPress={handleRagequit}
              disabled={!ragequitTo.trim() || isRagequitting}
              activeOpacity={0.85}
            >
              {isRagequitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.actionButtonText}>
                  Ragequit
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}

        <ThemedText style={[styles.hint, { color: textSecondary }]}>
          Pull down to refresh state
        </ThemedText>
      </ScrollView>

      <LogsFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    paddingTop: 12,
    marginBottom: 12,
    alignSelf: "stretch",
    width: "100%",
  },
  cardLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  textInput: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  tokenPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  tokenPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tokenPickerChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  setupButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  setupButton: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  setupButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  stateHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  stateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  stateLabel: {
    fontSize: 12,
  },
  stateValue: {
    fontSize: 12,
    fontWeight: "600",
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
  actionButton: {
    backgroundColor: "#000",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 10,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  ragequitButton: {
    backgroundColor: "#dc3545",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  hintText: {
    fontSize: 11,
    marginBottom: 4,
  },
  hint: {
    textAlign: "center",
    fontSize: 9,
    marginTop: 12,
    paddingHorizontal: 8,
  },
});
