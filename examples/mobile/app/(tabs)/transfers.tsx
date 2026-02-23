import { useCallback, useState, useMemo, useEffect, useRef } from "react";
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
import * as Haptics from "expo-haptics";
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
  getUsdcToken,
  getWbtcToken,
} from "@/stores/balances";
import {
  showTransactionToast,
  updateTransactionToast,
  showCopiedToast,
} from "@/components/Toast";
import { Amount, fromAddress, type Token, type ChainId } from "@starkware-ecosystem/starkzap";

const WBTC_LOGO_FALLBACK =
  "https://altcoinsbox.com/wp-content/uploads/2023/01/wbtc-wrapped-bitcoin-logo.png";
const SEPOLIA_USD_RATES = { USDC: 1, STRK: 0.05 } as const;

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

function TinyTokenLogo({ token }: { token: Token }) {
  const [imageError, setImageError] = useState(false);
  const primaryColor = useThemeColor({}, "primary");
  const borderColor = useThemeColor({}, "border");
  const useFallback = !token.metadata?.logoUrl || imageError;
  if (token.symbol === "WBTC" && useFallback) {
    return (
      <Image
        source={{ uri: WBTC_LOGO_FALLBACK }}
        style={tokenLogoStyles.tinyLogo}
        onError={() => setImageError(true)}
      />
    );
  }
  if (useFallback) {
    return (
      <View
        style={[
          tokenLogoStyles.tinyLogo,
          tokenLogoStyles.tinyLogoPlaceholder,
          { backgroundColor: borderColor },
        ]}
      >
        <ThemedText
          style={[tokenLogoStyles.tinyLogoText, { color: primaryColor }]}
        >
          {token.symbol.charAt(0)}
        </ThemedText>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: token.metadata!.logoUrl!.toString() }}
      style={tokenLogoStyles.tinyLogo}
      onError={() => setImageError(true)}
    />
  );
}

const tokenLogoStyles = StyleSheet.create({
  tinyLogo: { width: 20, height: 20, borderRadius: 10 },
  tinyLogoPlaceholder: { justifyContent: "center", alignItems: "center" },
  tinyLogoText: { fontSize: 10, fontWeight: "600" },
});

/** Get explorer URL for a transaction hash */
function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? "https://sepolia.voyager.online/tx"
      : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
}

function getErrorMessage(error: unknown): string {
  try {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message?: unknown }).message !== "undefined"
    ) {
      const message = (error as { message?: unknown }).message;
      return typeof message === "string" ? message : String(message);
    }
    return String(error);
  } catch {
    return "Unknown error";
  }
}

interface TransferItem {
  id: string;
  token: Token | null;
  amount: string;
  toAddress: string;
}

const createEmptyTransfer = (): TransferItem => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  token: null,
  amount: "",
  toAddress: "",
});

function createDefaultTransfer(defaultToken: Token): TransferItem {
  return {
    ...createEmptyTransfer(),
    token: defaultToken,
  };
}

export default function TransfersScreen() {
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

  const allTokens = getTokensForNetwork(chainId);
  const strkToken = getStrkToken(chainId);
  const wbtcToken = getWbtcToken(chainId);
  const usdcToken = getUsdcToken(chainId);
  const primaryTokens = useMemo(() => {
    const eth = allTokens.find((t) => t.symbol === "ETH");
    return [strkToken, wbtcToken, usdcToken, eth].filter(
      (t): t is Token => t != null
    );
  }, [allTokens, strkToken, wbtcToken, usdcToken]);

  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())?.name ??
    "Custom";

  const [transfers, setTransfers] = useState<TransferItem[]>([
    createEmptyTransfer(),
  ]);
  const hasSetDefaultToken = useRef(false);
  useEffect(() => {
    if (hasSetDefaultToken.current || !strkToken) return;
    hasSetDefaultToken.current = true;
    setTransfers((prev) =>
      prev.length > 0 && !prev[0]?.token
        ? [{ ...prev[0], token: strkToken }]
        : prev
    );
  }, [strkToken]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useSponsored, setUseSponsored] = useState(
    preferSponsored && Boolean(paymasterNodeUrl)
  );

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");

  // Token picker modal state
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);

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
    if (wallet) {
      await Clipboard.setStringAsync(wallet.address);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showCopiedToast();
    }
  }, [wallet]);

  const strkBalance = getBalance(strkToken);
  const usdcBalance = getBalance(usdcToken);
  const isSepolia =
    chainId.isSepolia?.() ?? chainId.toLiteral?.() === "SN_SEPOLIA";
  const totalUsd =
    isSepolia && (strkBalance || usdcBalance)
      ? parseBalanceToNumber(usdcBalance) * SEPOLIA_USD_RATES.USDC +
        parseBalanceToNumber(strkBalance) * SEPOLIA_USD_RATES.STRK
      : null;

  const handleOpenTokenPicker = useCallback((transferId: string) => {
    setActiveTransferId(transferId);
    setShowTokenPicker(true);
  }, []);

  const handleSelectToken = useCallback(
    (token: Token) => {
      if (!activeTransferId) return;

      setTransfers((prev) =>
        prev.map((t) =>
          t.id === activeTransferId ? { ...t, token, amount: "" } : t
        )
      );
      setShowTokenPicker(false);
      setActiveTransferId(null);
    },
    [activeTransferId]
  );

  const handleUpdateAmount = useCallback(
    (transferId: string, amount: string) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, amount } : t))
      );
    },
    []
  );

  const handleUpdateAddress = useCallback(
    (transferId: string, toAddress: string) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, toAddress } : t))
      );
    },
    []
  );

  const handleAddTransfer = useCallback(() => {
    setTransfers((prev) => [...prev, createDefaultTransfer(strkToken)]);
  }, [strkToken]);

  const handleRemoveTransfer = useCallback(
    (transferId: string) => {
      setTransfers((prev) => {
        if (prev.length <= 1) {
          return [createDefaultTransfer(strkToken)];
        }
        return prev.filter((t) => t.id !== transferId);
      });
    },
    [strkToken]
  );

  const handleClearAll = useCallback(() => {
    setTransfers([createDefaultTransfer(strkToken)]);
  }, [strkToken]);

  // Validate transfers
  const validTransfers = useMemo(() => {
    return transfers.filter(
      (t) =>
        t.token &&
        t.amount &&
        parseFloat(t.amount) > 0 &&
        t.toAddress &&
        t.toAddress.startsWith("0x")
    );
  }, [transfers]);

  const anyTransferExceedsBalance = useMemo(() => {
    return transfers.some((t) => {
      if (!t.token || !t.amount) return false;
      const balance = getBalance(t.token);
      if (!balance) return false;
      const balanceNum = parseFloat(balance.toUnit());
      const enteredNum = parseFloat(t.amount) || 0;
      return enteredNum > 0 && enteredNum > balanceNum;
    });
  }, [transfers, getBalance]);

  const canSubmit =
    validTransfers.length > 0 && !isSubmitting && !anyTransferExceedsBalance;
  const canUseSponsored = Boolean(paymasterNodeUrl);

  const handleSubmit = useCallback(async () => {
    if (!wallet || validTransfers.length === 0) return;

    setIsSubmitting(true);
    addLog(`Submitting ${validTransfers.length} transfer(s)...`);

    try {
      // Group transfers by token
      const transfersByToken = new Map<string, TransferItem[]>();
      for (const transfer of validTransfers) {
        const key = transfer.token!.address;
        const existing = transfersByToken.get(key) ?? [];
        existing.push(transfer);
        transfersByToken.set(key, existing);
      }

      // Execute transfers for each token using wallet's transfer method
      for (const tokenTransfers of transfersByToken.values()) {
        const token = tokenTransfers[0]!.token!;

        const transfersData = tokenTransfers.map((t) => ({
          to: fromAddress(t.toAddress),
          amount: Amount.parse(t.amount, token),
        }));

        addLog(
          `Transferring ${token.symbol} to ${transfersData.length} recipient(s)...`
        );
        const wantsSponsored = useSponsored && canUseSponsored;
        const tx = await wallet.transfer(
          token,
          transfersData,
          wantsSponsored ? { feeMode: "sponsored" } : undefined
        );

        addLog(`Transfer tx submitted: ${tx.hash.slice(0, 10)}...`);
        if (wantsSponsored) {
          addLog("Transaction submitted in sponsored mode");
        } else {
          addLog("Transaction submitted in user_pays mode");
        }

        // Show pending toast
        showTransactionToast(
          {
            txHash: tx.hash,
            title: `Transferring ${token.symbol}`,
            subtitle: `Sending to ${transfersData.length} recipient(s)`,
            explorerUrl: getExplorerUrl(tx.hash, chainId),
          },
          true
        );

        addLog("Waiting for confirmation...");
        await tx.wait();

        // Update toast to success
        updateTransactionToast({
          txHash: tx.hash,
          title: `${token.symbol} Transfer Complete`,
          subtitle: `Successfully sent to ${transfersData.length} recipient(s)`,
          explorerUrl: getExplorerUrl(tx.hash, chainId),
        });

        addLog(`${token.symbol} transfer confirmed!`);
      }

      // Clear transfers after success
      handleClearAll();

      // Refresh balances
      await fetchBalances(wallet, chainId);
    } catch (err) {
      addLog(`Transfer failed: ${getErrorMessage(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    wallet,
    validTransfers,
    chainId,
    addLog,
    handleClearAll,
    fetchBalances,
    useSponsored,
    canUseSponsored,
  ]);

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
            <ThemedText type="title">Transfers</ThemedText>
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

        {transfers.map((transfer, index) => (
          <View
            key={transfer.id}
            style={[
              styles.transferCard,
              { backgroundColor: cardBg, borderColor },
            ]}
          >
            {/* Same top as Balance card: Total (USD), amount, address, refresh (no transfer button) */}
            {index === 0 && (
              <>
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
                    style={[
                      styles.addressCopyBtn,
                      { backgroundColor: borderColor },
                    ]}
                    onPress={handleCopyAddress}
                    activeOpacity={0.88}
                  >
                    <ThemedText
                      style={[
                        styles.addressCopyBtnText,
                        { color: textSecondary },
                      ]}
                    >
                      {wallet ? cropAddress(wallet.address) : ""}
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleRefresh}
                    hitSlop={6}
                    style={[
                      styles.refreshBtn,
                      { backgroundColor: borderColor },
                    ]}
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
              </>
            )}

            {transfers.length > 1 && index > 0 && (
              <View style={styles.transferHeader}>
                <ThemedText
                  style={[styles.transferIndex, { color: textSecondary }]}
                >
                  Transfer #{index + 1}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => handleRemoveTransfer(transfer.id)}
                  style={[styles.removeButton, { borderColor }]}
                >
                  <ThemedText style={styles.removeButtonText}>
                    Remove
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}

            {/* One field: Token dropdown (logo + name) + Amount input + MAX */}
            <View style={styles.fieldContainer}>
              <View style={styles.usdTotalHeaderRow}>
                <ThemedText
                  style={[styles.usdTotalLabel, { color: textSecondary }]}
                >
                  Transfer
                </ThemedText>
              </View>
              <View
                style={[
                  styles.amountTokenRow,
                  {
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.amountTokenDropdown}
                  onPress={() => handleOpenTokenPicker(transfer.id)}
                  activeOpacity={0.88}
                >
                  {transfer.token ? (
                    <>
                      <TinyTokenLogo token={transfer.token} />
                      <View style={styles.amountTokenDropdownLabels}>
                        <ThemedText
                          style={[
                            styles.amountTokenSymbol,
                            { color: primaryColor },
                          ]}
                        >
                          {transfer.token.symbol}
                        </ThemedText>
                      </View>
                    </>
                  ) : (
                    <ThemedText
                      style={[
                        styles.placeholderTextSmall,
                        { color: textSecondary },
                      ]}
                    >
                      Select token
                    </ThemedText>
                  )}
                  <ThemedText
                    style={[styles.chevronSmall, { color: textSecondary }]}
                  >
                    ▼
                  </ThemedText>
                </TouchableOpacity>
                <View style={styles.amountInputMaxWrap}>
                  {(() => {
                    const balance = transfer.token
                      ? getBalance(transfer.token)
                      : null;
                    const balanceNum = balance
                      ? parseFloat(balance.toUnit())
                      : 0;
                    const enteredNum = parseFloat(transfer.amount) || 0;
                    const exceedsBalance =
                      !!transfer.token &&
                      enteredNum > 0 &&
                      enteredNum > balanceNum;
                    return (
                      <TextInput
                        style={[
                          styles.amountInput,
                          { color: exceedsBalance ? "#e53935" : primaryColor },
                        ]}
                        value={transfer.amount}
                        onChangeText={(amount) =>
                          handleUpdateAmount(transfer.id, amount)
                        }
                        placeholder="0.0"
                        placeholderTextColor={textSecondary}
                        keyboardType="decimal-pad"
                        editable={!!transfer.token}
                      />
                    );
                  })()}
                  {transfer.token && getBalance(transfer.token) && (
                    <TouchableOpacity
                      style={[
                        styles.maxButton,
                        { backgroundColor: borderColor },
                      ]}
                      onPress={() =>
                        handleUpdateAmount(
                          transfer.id,
                          getBalance(transfer.token)!.toUnit()
                        )
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
              </View>
              {/* Sponsored + switch and Balance on one line below the dropdown, right-aligned */}
              <View style={styles.balanceSponsoredRow}>
                {index === 0 && (
                  <View style={styles.sponsoredInline}>
                    <ThemedText
                      style={[styles.usdTotalLabel, { color: textSecondary }]}
                    >
                      Sponsored
                    </ThemedText>
                    <View
                      style={[
                        styles.sponsoredSwitchWrapperCompact,
                        (!canUseSponsored || isSubmitting) &&
                          styles.sponsoredSwitchDisabled,
                      ]}
                      pointerEvents={
                        !canUseSponsored || isSubmitting ? "none" : "auto"
                      }
                    >
                      <TouchableOpacity
                        style={[
                          styles.sponsoredSwitchSegmentCompact,
                          !useSponsored &&
                            styles.sponsoredSwitchSegmentSelected,
                        ]}
                        onPress={() => setUseSponsored(false)}
                        disabled={!canUseSponsored || isSubmitting}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.sponsoredSwitchTextCompact,
                            !useSponsored && styles.sponsoredSwitchTextSelected,
                          ]}
                        >
                          Off
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.sponsoredSwitchSegmentCompact,
                          useSponsored && styles.sponsoredSwitchSegmentSelected,
                        ]}
                        onPress={() => setUseSponsored(true)}
                        disabled={!canUseSponsored || isSubmitting}
                        activeOpacity={0.88}
                      >
                        <ThemedText
                          style={[
                            styles.sponsoredSwitchTextCompact,
                            useSponsored && styles.sponsoredSwitchTextSelected,
                          ]}
                        >
                          On
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {transfer.token && getBalance(transfer.token) != null && (
                  <ThemedText
                    style={[
                      styles.balanceLabelInline,
                      { color: textSecondary },
                    ]}
                  >
                    Balance: {getBalance(transfer.token)!.toFormatted(true)}
                  </ThemedText>
                )}
              </View>
              {index === 0 && !canUseSponsored && (
                <ThemedText
                  style={[
                    styles.sponsoredHintCompact,
                    { color: textSecondary },
                  ]}
                >
                  Paymaster not configured
                </ThemedText>
              )}
            </View>

            <View style={styles.fieldContainer}>
              <ThemedText style={[styles.cardLabel, { color: textSecondary }]}>
                To Address
              </ThemedText>
              <TextInput
                style={[
                  styles.addressInput,
                  {
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor,
                    color: primaryColor,
                  },
                ]}
                value={transfer.toAddress}
                onChangeText={(address) =>
                  handleUpdateAddress(transfer.id, address)
                }
                placeholder="0x..."
                placeholderTextColor={textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.addTransferPlaceholder, { borderColor }]}
          onPress={handleAddTransfer}
          activeOpacity={0.7}
        >
          <ThemedText
            style={[
              styles.addTransferPlaceholderText,
              { color: textSecondary },
            ]}
          >
            ＋ Add another transfer
          </ThemedText>
        </TouchableOpacity>

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
              {validTransfers.length > 0
                ? `Submit ${validTransfers.length} Transfer${validTransfers.length > 1 ? "s" : ""}`
                : "Complete All Fields"}
            </ThemedText>
          )}
        </TouchableOpacity>

        {transfers.length > 1 && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearAll}>
            <ThemedText
              style={[styles.clearButtonText, { color: textSecondary }]}
            >
              Clear All
            </ThemedText>
          </TouchableOpacity>
        )}

        <ThemedText style={[styles.hint, { color: textSecondary }]}>
          Pull down to refresh balances
        </ThemedText>
      </ScrollView>

      {/* Token Picker Modal: ETH, STRK, USDC with logos (match Balance tab) */}
      <Modal
        visible={showTokenPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTokenPicker(false)}
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
              onPress={() => setShowTokenPicker(false)}
              activeOpacity={0.88}
            >
              <ThemedText
                style={[styles.modalCloseText, { color: primaryColor }]}
              >
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={[styles.tokenPickerList, { borderColor }]}>
            {primaryTokens.map((token, idx) => {
              const balance = getBalance(token);
              return (
                <View key={token.address}>
                  {idx > 0 && (
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
  transferCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    paddingTop: 8,
    marginBottom: 12,
    alignSelf: "stretch",
    alignItems: "center",
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
  transferHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 12,
  },
  transferIndex: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  removeButtonText: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "600",
  },
  fieldContainer: {
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
  amountLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 11,
  },
  balanceLabelBelow: {
    fontSize: 11,
    marginTop: 6,
    alignSelf: "flex-end",
  },
  balanceSponsoredRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  balanceLabelInline: {
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
  amountTokenDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 2,
    flexShrink: 0,
  },
  amountTokenDropdownLabels: {
    minWidth: 0,
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
  tokenSelectorSmall: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    minHeight: 32,
  },
  addressInput: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    borderWidth: 1,
  },
  tokenSymbolSmall: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  placeholderTextSmall: {
    fontSize: 12,
    flex: 1,
  },
  chevronSmall: {
    fontSize: 10,
  },
  tokenPickerList: {
    margin: 16,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  tokenPickerDivider: {
    height: 1,
    width: "100%",
  },
  tokenPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tokenPickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  tokenPickerStack: {
    gap: 2,
  },
  tokenPickerSymbol: {
    fontSize: 15,
    fontWeight: "700",
  },
  tokenPickerAmount: {
    fontSize: 13,
  },
  addTransferPlaceholder: {
    alignSelf: "stretch",
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addTransferPlaceholderText: {
    fontSize: 11,
    fontWeight: "500",
  },
  sponsoredInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sponsoredRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    alignSelf: "stretch",
  },
  sponsoredLabelCompact: {
    fontSize: 10,
    fontWeight: "400",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sponsoredSwitchWrapperCompact: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#e5e7e5",
    padding: 0.5,
  },
  sponsoredSwitchDisabled: {
    opacity: 0.5,
  },
  sponsoredSwitchSegmentCompact: {
    paddingVertical: 0,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
    minWidth: 28,
    minHeight: 14,
  },
  sponsoredSwitchSegmentSelected: {
    backgroundColor: "#e2e8f0",
  },
  sponsoredSwitchTextCompact: {
    fontSize: 6,
    fontWeight: "600",
    color: "#000",
  },
  sponsoredSwitchTextSelected: {
    color: "#374151",
  },
  sponsoredHintCompact: {
    marginTop: 2,
    marginBottom: 6,
    fontSize: 9,
  },
  submitButton: {
    alignSelf: "stretch",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  submitButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  clearButton: {
    paddingVertical: 8,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 11,
  },
  hint: {
    textAlign: "center",
    fontSize: 9,
    marginTop: 12,
    paddingHorizontal: 8,
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
});
