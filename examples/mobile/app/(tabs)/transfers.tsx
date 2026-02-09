import { useCallback, useState, useMemo } from "react";
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
import { AmountInput } from "@/components/AmountInput";
import { LogsFAB } from "@/components/LogsFAB";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import { useBalancesStore, getTokensForNetwork } from "@/stores/balances";
import {
  showTransactionToast,
  updateTransactionToast,
} from "@/components/Toast";
import { Amount, fromAddress, type Token, type ChainId } from "x";

/** Get explorer URL for a transaction hash */
function getExplorerUrl(txHash: string, chainId: ChainId): string {
  const baseUrl =
    chainId.toLiteral() === "SN_SEPOLIA"
      ? "https://sepolia.voyager.online/tx"
      : "https://voyager.online/tx";
  return `${baseUrl}/${txHash}`;
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

export default function TransfersScreen() {
  const { wallet, chainId, addLog } = useWalletStore();
  const {
    getBalance,
    fetchBalances,
    isLoading: isLoadingBalances,
  } = useBalancesStore();

  const allTokens = getTokensForNetwork(chainId);
  const networkName =
    NETWORKS.find((n) => n.chainId === chainId)?.name ?? "Custom";

  // Transfer state
  const [transfers, setTransfers] = useState<TransferItem[]>([
    createEmptyTransfer(),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Token picker modal state
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const [tokenSearchQuery, setTokenSearchQuery] = useState("");

  // Filter tokens by search
  const filteredTokens = useMemo(
    () =>
      allTokens.filter(
        (token) =>
          token.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
          token.name.toLowerCase().includes(tokenSearchQuery.toLowerCase())
      ),
    [allTokens, tokenSearchQuery]
  );

  const handleRefresh = useCallback(async () => {
    if (wallet) {
      await fetchBalances(wallet, chainId);
    }
  }, [wallet, chainId, fetchBalances]);

  const handleOpenTokenPicker = useCallback((transferId: string) => {
    setActiveTransferId(transferId);
    setTokenSearchQuery("");
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
    setTransfers((prev) => [...prev, createEmptyTransfer()]);
  }, []);

  const handleRemoveTransfer = useCallback((transferId: string) => {
    setTransfers((prev) => {
      // Keep at least one transfer
      if (prev.length <= 1) {
        return [createEmptyTransfer()];
      }
      return prev.filter((t) => t.id !== transferId);
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setTransfers([createEmptyTransfer()]);
  }, []);

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

  const canSubmit = validTransfers.length > 0 && !isSubmitting;

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
      for (const [_, tokenTransfers] of transfersByToken) {
        const token = tokenTransfers[0]!.token!;

        const transfersData = tokenTransfers.map((t) => ({
          to: fromAddress(t.toAddress),
          amount: Amount.parse(t.amount, token),
        }));

        addLog(
          `Transferring ${token.symbol} to ${transfersData.length} recipient(s)...`
        );

        const tx = await wallet.transfer(token, transfersData);

        addLog(`Transfer tx submitted: ${tx.hash.slice(0, 10)}...`);

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
      addLog(`Transfer failed: ${err}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [wallet, validTransfers, chainId, addLog, handleClearAll, fetchBalances]);

  if (!wallet) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <ThemedText type="title">Transfers</ThemedText>
        <View style={styles.networkBadge}>
          <ThemedText style={styles.networkBadgeText}>{networkName}</ThemedText>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingBalances}
            onRefresh={handleRefresh}
            tintColor="#0a7ea4"
          />
        }
      >
        <ThemedText style={styles.sectionTitle}>
          Transfers ({transfers.length})
        </ThemedText>

        {transfers.map((transfer, index) => (
          <View key={transfer.id} style={styles.transferCard}>
            <View style={styles.transferHeader}>
              <ThemedText style={styles.transferIndex}>#{index + 1}</ThemedText>
              {transfers.length > 1 && (
                <TouchableOpacity
                  onPress={() => handleRemoveTransfer(transfer.id)}
                  style={styles.removeButton}
                >
                  <ThemedText style={styles.removeButtonText}>
                    Remove
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* Token Selector */}
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.fieldLabel}>Token</ThemedText>
              <TouchableOpacity
                style={styles.tokenSelector}
                onPress={() => handleOpenTokenPicker(transfer.id)}
              >
                {transfer.token ? (
                  <View style={styles.selectedToken}>
                    <ThemedText style={styles.tokenSymbol}>
                      {transfer.token.symbol}
                    </ThemedText>
                    <ThemedText style={styles.tokenName}>
                      {transfer.token.name}
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText style={styles.placeholderText}>
                    Select a token
                  </ThemedText>
                )}
                <ThemedText style={styles.chevron}>›</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            {transfer.token && (
              <AmountInput
                value={transfer.amount}
                onChangeText={(amount) =>
                  handleUpdateAmount(transfer.id, amount)
                }
                token={transfer.token}
                balance={getBalance(transfer.token)}
                label="Amount"
              />
            )}

            {/* Destination Address */}
            <View style={styles.fieldContainer}>
              <ThemedText style={styles.fieldLabel}>To Address</ThemedText>
              <TextInput
                style={styles.addressInput}
                value={transfer.toAddress}
                onChangeText={(address) =>
                  handleUpdateAddress(transfer.id, address)
                }
                placeholder="0x..."
                placeholderTextColor="#888"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        ))}

        {/* Add Transfer Button */}
        <TouchableOpacity
          style={styles.addTransferButton}
          onPress={handleAddTransfer}
        >
          <ThemedText style={styles.addTransferButtonText}>
            + Add Another Transfer
          </ThemedText>
        </TouchableOpacity>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText style={styles.submitButtonText}>
              {validTransfers.length > 0
                ? `Submit ${validTransfers.length} Transfer${validTransfers.length > 1 ? "s" : ""}`
                : "Complete All Fields"}
            </ThemedText>
          )}
        </TouchableOpacity>

        {transfers.length > 1 && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearAll}>
            <ThemedText style={styles.clearButtonText}>Clear All</ThemedText>
          </TouchableOpacity>
        )}

        <ThemedText style={styles.hint}>
          Pull down to refresh balances
        </ThemedText>
      </ScrollView>

      {/* Token Picker Modal */}
      <Modal
        visible={showTokenPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTokenPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="title">Select Token</ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowTokenPicker(false)}
            >
              <ThemedText style={styles.modalCloseText}>Close</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search tokens..."
              placeholderTextColor="#888"
              value={tokenSearchQuery}
              onChangeText={setTokenSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filteredTokens}
            keyExtractor={(token) => token.address}
            contentContainerStyle={styles.tokenList}
            renderItem={({ item: token }) => {
              const balance = getBalance(token);
              return (
                <TouchableOpacity
                  style={styles.tokenCard}
                  onPress={() => handleSelectToken(token)}
                >
                  <View style={styles.tokenInfo}>
                    <ThemedText style={styles.tokenCardSymbol}>
                      {token.symbol}
                    </ThemedText>
                    <ThemedText style={styles.tokenCardName}>
                      {token.name}
                    </ThemedText>
                  </View>
                  {balance && (
                    <ThemedText style={styles.tokenBalance}>
                      {balance.toFormatted(true)}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <ThemedText style={styles.emptyText}>No tokens found</ThemedText>
            }
          />
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
  transferCard: {
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  transferHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  transferIndex: {
    fontSize: 16,
    fontWeight: "600",
    opacity: 0.5,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: "#dc3545",
    fontSize: 14,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  tokenSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    padding: 12,
  },
  selectedToken: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  tokenName: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  placeholderText: {
    color: "#888",
    fontSize: 16,
  },
  chevron: {
    fontSize: 20,
    opacity: 0.5,
    marginLeft: 8,
  },
  addressInput: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.3)",
    padding: 12,
    fontSize: 14,
    color: "#fff",
    fontFamily: "monospace",
  },
  addTransferButton: {
    padding: 16,
    backgroundColor: "rgba(10, 126, 164, 0.1)",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(10, 126, 164, 0.3)",
    borderStyle: "dashed",
    alignItems: "center",
    marginBottom: 16,
  },
  addTransferButtonText: {
    color: "#0a7ea4",
    fontSize: 16,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#0a7ea4",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  clearButton: {
    padding: 12,
    alignItems: "center",
  },
  clearButtonText: {
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
  tokenList: {
    padding: 16,
    paddingBottom: 40,
  },
  tokenCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    marginBottom: 12,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenCardSymbol: {
    fontSize: 18,
    fontWeight: "600",
  },
  tokenCardName: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  tokenBalance: {
    fontSize: 14,
    opacity: 0.7,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.5,
    paddingVertical: 20,
  },
});
