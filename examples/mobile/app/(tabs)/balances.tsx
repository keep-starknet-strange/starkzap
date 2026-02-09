import { useEffect, useCallback, useState, useMemo } from "react";
import {
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { usePrivy } from "@privy-io/expo";

import { ThemedText } from "@/components/themed-text";
import { TokenBalance } from "@/components/TokenBalance";
import { LogsFAB } from "@/components/LogsFAB";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import { useBalancesStore, getTokensForNetwork } from "@/stores/balances";
import type { Token } from "x";

const BATCH_SIZE = 20;

export default function BalancesScreen() {
  const { wallet, chainId, walletType, disconnect, resetNetworkConfig } =
    useWalletStore();
  const { logout } = usePrivy();
  const { balances, isLoading, fetchBalances, getBalance, clearBalances } =
    useBalancesStore();

  const allTokens = getTokensForNetwork(chainId);
  const networkName =
    NETWORKS.find((n) => n.chainId === chainId)?.name ?? "Custom";

  // Pagination state
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  const visibleTokens = useMemo(
    () => allTokens.slice(0, visibleCount),
    [allTokens, visibleCount]
  );

  const hasMore = visibleCount < allTokens.length;

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, allTokens.length));
    }
  }, [hasMore, isLoading, allTokens.length]);

  const handleRefresh = useCallback(() => {
    if (wallet) {
      fetchBalances(wallet, chainId);
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
    }
  }, [wallet]);

  // Reset visible count when network changes
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [chainId]);

  useEffect(() => {
    if (wallet) {
      fetchBalances(wallet, chainId);
    }
  }, [wallet, chainId, fetchBalances]);

  const renderToken = useCallback(
    ({ item: token }: { item: Token }) => (
      <TokenBalance
        key={token.address}
        token={token}
        balance={getBalance(token)}
        isLoading={isLoading && !balances.has(token.address)}
      />
    ),
    [getBalance, isLoading, balances]
  );

  const renderFooter = useCallback(() => {
    if (!hasMore) {
      return (
        <ThemedText style={styles.hint}>
          Pull down to refresh balances
        </ThemedText>
      );
    }
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color="#0a7ea4" />
        <ThemedText style={styles.loadingMoreText}>Loading more...</ThemedText>
      </View>
    );
  }, [hasMore]);

  const renderHeader = useCallback(
    () => (
      <ThemedText style={styles.sectionTitle}>
        Token Balances ({visibleTokens.length} of {allTokens.length})
      </ThemedText>
    ),
    [visibleTokens.length, allTokens.length]
  );

  if (!wallet) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <ThemedText type="title">Balances</ThemedText>
          <View style={styles.networkRow}>
            <View style={styles.networkBadge}>
              <ThemedText style={styles.networkBadgeText}>
                {networkName}
              </ThemedText>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={handleDisconnect}
        >
          <ThemedText style={styles.disconnectButtonText}>
            Disconnect
          </ThemedText>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.addressCard}
        onPress={handleCopyAddress}
        activeOpacity={0.7}
      >
        <View style={styles.addressHeader}>
          <ThemedText style={styles.addressLabel}>Connected Address</ThemedText>
          <ThemedText style={styles.copyHint}>Tap to copy</ThemedText>
        </View>
        <ThemedText style={styles.address} numberOfLines={1}>
          {wallet.address}
        </ThemedText>
      </TouchableOpacity>

      <FlatList
        data={visibleTokens}
        renderItem={renderToken}
        keyExtractor={(token) => token.address}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor="#0a7ea4"
          />
        }
      />

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
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  networkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
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
  disconnectButton: {
    backgroundColor: "#dc3545",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  disconnectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  addressCard: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 8,
    marginBottom: 8,
  },
  addressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  copyHint: {
    fontSize: 11,
    color: "#0a7ea4",
    fontWeight: "500",
  },
  address: {
    fontFamily: "monospace",
    fontSize: 12,
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
  hint: {
    textAlign: "center",
    fontSize: 12,
    opacity: 0.4,
    marginTop: 16,
  },
  loadingMore: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    opacity: 0.6,
  },
});
