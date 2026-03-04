import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount, useAppKit } from "@reown/appkit-react-native";
import { useEffect, useState } from "react";
import { ExternalChain } from "@starkzap/native";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { type BridgeChainFilter, useWalletStore } from "@/stores/wallet";

export default function BridgeScreen() {
  const [isTokensSectionExpanded, setIsTokensSectionExpanded] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const bg = useThemeColor({}, "background");
  const { open } = useAppKit();
  const { address, chain, isConnected } = useAccount();
  const {
    bridgeChain: selectedChain,
    bridgeTokens: tokens,
    bridgeIsLoading: isLoading,
    bridgeError: error,
    bridgeLastUpdated: lastUpdated,
    setBridgeChain,
    fetchBridgeTokens,
    refreshBridgeTokens,
  } = useWalletStore((state) => state);

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : undefined;

  useEffect(() => {
    if (!isTokensSectionExpanded) {
      return;
    }
    void fetchBridgeTokens();
  }, [selectedChain, fetchBridgeTokens, isTokensSectionExpanded]);

  const chainOptions: { label: string; value: BridgeChainFilter }[] = [
    { label: "All", value: "all" },
    { label: "Ethereum", value: ExternalChain.ETHEREUM },
    { label: "Solana", value: ExternalChain.SOLANA },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText type="title">Bridge</ThemedText>
          <TouchableOpacity
            style={[
              styles.connectButton,
              { borderColor, backgroundColor: `${primaryColor}15` },
            ]}
            onPress={() => {
              open();
            }}
          >
            <ThemedText
              style={[styles.connectButtonText, { color: primaryColor }]}
            >
              {isConnected ? "Wallet Connected" : "Connect Wallet"}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {isConnected && address ? (
          <View style={[styles.connectionCard, { borderColor }]}>
            <ThemedText style={styles.connectionTitle}>
              Connected Wallet
            </ThemedText>
            <ThemedText
              style={[styles.connectionLine, { color: textSecondary }]}
            >
              Address: {shortAddress}
            </ThemedText>
            <ThemedText
              style={[styles.connectionLine, { color: textSecondary }]}
            >
              Chain: {chain?.name ?? "Unknown"}
            </ThemedText>
          </View>
        ) : (
          <ThemedText
            style={[styles.disconnectedHint, { color: textSecondary }]}
          >
            No wallet connected.
          </ThemedText>
        )}

        <View
          style={[styles.sectionCard, { borderColor, backgroundColor: bg }]}
        >
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>
              Available Bridge Tokens
            </ThemedText>
            <View style={styles.sectionActions}>
              {isTokensSectionExpanded ? (
                <TouchableOpacity
                  style={[
                    styles.refreshButton,
                    { borderColor, backgroundColor: `${primaryColor}12` },
                  ]}
                  onPress={() => {
                    void refreshBridgeTokens();
                  }}
                >
                  <ThemedText
                    style={[styles.refreshButtonText, { color: primaryColor }]}
                  >
                    Refresh
                  </ThemedText>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  { borderColor, backgroundColor: `${primaryColor}12` },
                ]}
                onPress={() => {
                  setIsTokensSectionExpanded((prev) => !prev);
                }}
              >
                <ThemedText
                  style={[styles.toggleButtonText, { color: primaryColor }]}
                >
                  {isTokensSectionExpanded ? "Collapse" : "Expand"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {!isTokensSectionExpanded ? (
            <ThemedText
              style={[styles.collapsedHint, { color: textSecondary }]}
            >
              Section collapsed. Tap Expand to load and view bridge tokens.
            </ThemedText>
          ) : null}

          {isTokensSectionExpanded ? (
            <>
              <View style={styles.filterBlock}>
                <ThemedText
                  style={[styles.filterTitle, { color: textSecondary }]}
                >
                  Chain
                </ThemedText>
                <View style={styles.filterRow}>
                  {chainOptions.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterButton,
                        {
                          borderColor,
                          backgroundColor:
                            selectedChain === option.value
                              ? `${primaryColor}15`
                              : cardBg,
                        },
                      ]}
                      onPress={() => setBridgeChain(option.value)}
                    >
                      <ThemedText
                        style={[
                          styles.filterButtonText,
                          {
                            color:
                              selectedChain === option.value
                                ? primaryColor
                                : textSecondary,
                          },
                        ]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {isLoading && tokens.length === 0 ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <ThemedText
                    style={[styles.loadingText, { color: textSecondary }]}
                  >
                    Loading bridge tokens...
                  </ThemedText>
                </View>
              ) : null}

              {error ? (
                <ThemedText style={[styles.errorText, { color: "#D44545" }]}>
                  {error}
                </ThemedText>
              ) : null}

              {!isLoading && !error && tokens.length === 0 ? (
                <ThemedText
                  style={[styles.emptyText, { color: textSecondary }]}
                >
                  No tokens available for the selected filters.
                </ThemedText>
              ) : null}

              {tokens.map((token) => (
                <View
                  key={`${token.chain}-${token.id}-${token.l2TokenAddress}`}
                  style={[
                    styles.tokenCard,
                    { borderColor, backgroundColor: cardBg },
                  ]}
                >
                  <View style={styles.tokenHeader}>
                    <ThemedText style={styles.tokenSymbol}>
                      {token.symbol}
                    </ThemedText>
                    <ThemedText
                      style={[styles.tokenChain, { color: textSecondary }]}
                    >
                      {token.chain}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.tokenName}>{token.name}</ThemedText>
                  <ThemedText
                    style={[styles.tokenMeta, { color: textSecondary }]}
                  >
                    Protocol: {token.protocol}
                  </ThemedText>
                  <ThemedText
                    style={[styles.tokenMeta, { color: textSecondary }]}
                  >
                    L2 Token:{" "}
                    {`${token.l2TokenAddress.slice(0, 10)}...${token.l2TokenAddress.slice(-8)}`}
                  </ThemedText>
                </View>
              ))}

              {lastUpdated ? (
                <ThemedText
                  style={[styles.updatedAt, { color: textSecondary }]}
                >
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </ThemedText>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  connectButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  connectionCard: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  connectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  connectionLine: {
    fontSize: 13,
    fontWeight: "500",
  },
  disconnectedHint: {
    fontSize: 13,
    fontWeight: "500",
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  refreshButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  toggleButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  collapsedHint: {
    fontSize: 13,
    fontWeight: "500",
  },
  filterBlock: {
    gap: 6,
  },
  filterTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  envValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "500",
  },
  tokenCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  tokenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tokenSymbol: {
    fontSize: 15,
    fontWeight: "700",
  },
  tokenChain: {
    fontSize: 12,
    fontWeight: "600",
  },
  tokenName: {
    fontSize: 13,
    fontWeight: "600",
  },
  tokenMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  updatedAt: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
});
