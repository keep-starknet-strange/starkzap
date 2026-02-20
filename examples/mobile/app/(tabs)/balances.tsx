import { useEffect, useCallback, useState, useMemo } from "react";
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { usePrivy } from "@privy-io/expo";

import Ionicons from "@expo/vector-icons/Ionicons";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/themed-text";
import { LogsFAB } from "@/components/LogsFAB";
import { showCopiedToast } from "@/components/Toast";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useWalletStore, NETWORKS } from "@/stores/wallet";
import {
  useBalancesStore,
  getTokensForNetwork,
  getStrkToken,
  getUsdcToken,
  getWbtcToken,
} from "@/stores/balances";
import type { Token, Amount } from "x";

// Fallback logo when WBTC has no logo or image fails to load
const WBTC_LOGO_FALLBACK = "https://altcoinsbox.com/wp-content/uploads/2023/01/wbtc-wrapped-bitcoin-logo.png";

// Sepolia demo conversion rates (hardcoded)
const SEPOLIA_USD_RATES = { USDC: 1, STRK: 0.05, WBTC: 97000 } as const;

const SEPOLIA_FAUCET_URL = "https://starknet-faucet.vercel.app/";
// Query param the faucet may use to pre-fill the address field. Common names: "address", "addr", "wallet".
// To verify: open in a browser e.g. SEPOLIA_FAUCET_URL + "?address=0x123" and see if the field is filled.
const FAUCET_ADDRESS_PARAM = "address";

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
        style={styles.tinyLogo}
        onError={() => setImageError(true)}
      />
    );
  }
  if (useFallback) {
    return (
      <View style={[styles.tinyLogo, styles.tinyLogoPlaceholder, { backgroundColor: borderColor }]}>
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

export default function BalancesScreen() {
  const {
    wallet,
    chainId,
    walletType,
    disconnect,
    resetNetworkConfig,
    isDeployed,
    isConnecting,
    deploy,
    checkDeploymentStatus,
  } = useWalletStore();
  const { logout } = usePrivy();
  const { balances, isLoading, fetchBalances, getBalance, clearBalances } =
    useBalancesStore();

  const _insets = useSafeAreaInsets();
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");

  const allTokens = getTokensForNetwork(chainId);
  const strkToken = getStrkToken(chainId);
  const wbtcToken = getWbtcToken(chainId);
  const usdcToken = getUsdcToken(chainId);
  const moreTokens = useMemo(() => {
    const eth = allTokens.find((t) => t.symbol === "ETH");
    return [eth].filter((t): t is Token => t != null);
  }, [allTokens]);

  const networkName =
    NETWORKS.find((n) => n.chainId.toLiteral() === chainId.toLiteral())
      ?.name ?? "Custom";

  const [showMoreTokens, setShowMoreTokens] = useState(false);

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showCopiedToast();
    }
  }, [wallet]);

  const handleClaimStrk = useCallback(async () => {
    if (!wallet) return;
    await Clipboard.setStringAsync(wallet.address);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showCopiedToast();
    // Open browser after a short delay so "Address copied" toast is visible first (browser would cover it otherwise)
    const url = `${SEPOLIA_FAUCET_URL}?${FAUCET_ADDRESS_PARAM}=${encodeURIComponent(wallet.address)}`;
    setTimeout(() => {
      void WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    }, 700);
  }, [wallet]);

  useEffect(() => {
    if (wallet) {
      fetchBalances(wallet, chainId);
    }
  }, [wallet, chainId, fetchBalances]);

  useEffect(() => {
    if (wallet && isDeployed === null) {
      void checkDeploymentStatus();
    }
  }, [wallet, isDeployed, checkDeploymentStatus]);

  if (!wallet) {
    return null;
  }

  const strkBalance = getBalance(strkToken);
  const wbtcBalance = getBalance(wbtcToken);
  const usdcBalance = getBalance(usdcToken);

  const isSepolia = chainId.isSepolia?.() ?? chainId.toLiteral?.() === "SN_SEPOLIA";
  const totalUsd =
    isSepolia && (strkBalance || wbtcBalance || usdcBalance)
      ? parseBalanceToNumber(usdcBalance) * SEPOLIA_USD_RATES.USDC +
        parseBalanceToNumber(strkBalance) * SEPOLIA_USD_RATES.STRK +
        parseBalanceToNumber(wbtcBalance) * SEPOLIA_USD_RATES.WBTC
      : null;

  const contentPaddingTop = 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: contentPaddingTop }]}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <ThemedText type="title">Balances</ThemedText>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.networkPill, { backgroundColor: borderColor }]}>
              <ThemedText style={[styles.networkPillText, { color: primaryColor }]}>
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

        {/* Single balance card: centered content */}
        <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.usdTotalHeaderRow}>
            <ThemedText style={[styles.usdTotalLabel, { color: textSecondary }]}>
              Total (USD)
            </ThemedText>
          </View>
          <View style={styles.usdTotalAmountWrap}>
            {isLoading ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : totalUsd != null ? (
              <ThemedText style={styles.usdTotalAmount}>
                ${totalUsd.toLocaleString("default", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </ThemedText>
            ) : (
              <ThemedText style={[styles.usdTotalAmount, { color: textSecondary }]}>—</ThemedText>
            )}
          </View>
          <View style={styles.addressCopyRow}>
            <TouchableOpacity
              style={[styles.addressCopyBtn, { backgroundColor: borderColor }]}
              onPress={handleCopyAddress}
              activeOpacity={0.88}
            >
              <ThemedText style={[styles.addressCopyBtnText, { color: textSecondary }]}>
                {cropAddress(wallet.address)}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRefresh}
              hitSlop={6}
              style={[styles.refreshBtn, { backgroundColor: borderColor }]}
              disabled={isLoading}
              activeOpacity={0.88}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={primaryColor} style={styles.refreshBtnSpinner} />
              ) : (
                <Ionicons name="refresh" size={12} color={primaryColor} />
              )}
            </TouchableOpacity>
            {isDeployed === true && (
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/transfers")}
                hitSlop={6}
                style={[styles.refreshBtn, { backgroundColor: borderColor }]}
                activeOpacity={0.88}
              >
                <IconSymbol name="arrow.left.arrow.right" size={12} color={primaryColor} />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.balanceCardDivider, { backgroundColor: borderColor }]} />
          <View style={styles.usdTotalHeaderRow}>
            <ThemedText style={[styles.usdTotalLabel, { color: textSecondary }]}>
              Token
            </ThemedText>
          </View>
          <View style={styles.balanceSection}>
            <View style={styles.primaryBalances}>
              <View style={styles.tokenBalanceRow}>
                <View style={styles.tokenBalanceLeft}>
                  <TinyTokenLogo token={strkToken} />
                  <View style={styles.tokenBalanceStack}>
                    <ThemedText style={styles.tokenCurrencyBold}>STRK</ThemedText>
                    <View style={styles.tokenAmountRow}>
                      <ThemedText style={[styles.tokenAmountGrey, { color: textSecondary }]}>
                        {isLoading && !balances.has(strkToken.address)
                          ? "…"
                          : strkBalance
                            ? formatBalanceNumber(strkBalance)
                            : "—"}
                      </ThemedText>
                      {isSepolia && !(isLoading && !balances.has(strkToken.address)) && (!strkBalance || parseBalanceToNumber(strkBalance) === 0) && (
                        <TouchableOpacity onPress={handleClaimStrk} hitSlop={6} style={styles.claimStrkLinkWrap}>
                          <ThemedText style={[styles.claimStrkLink, { color: textSecondary }]}>
                            Claim test STRK
                          </ThemedText>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.tokenBalanceRight}>
                  <ThemedText style={styles.tokenUsdBold}>
                    {isLoading && !balances.has(strkToken.address)
                      ? "…"
                      : strkBalance && isSepolia
                        ? `$${(parseBalanceToNumber(strkBalance) * SEPOLIA_USD_RATES.STRK).toLocaleString("default", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                  </ThemedText>
                  <ThemedText style={[styles.tokenRateGrey, { color: textSecondary }]}>
                    * {SEPOLIA_USD_RATES.STRK} USD
                  </ThemedText>
                </View>
              </View>
            <View style={[styles.primaryDivider, { backgroundColor: borderColor }]} />
              <View style={styles.tokenBalanceRow}>
                <View style={styles.tokenBalanceLeft}>
                  <TinyTokenLogo token={wbtcToken} />
                  <View style={styles.tokenBalanceStack}>
                    <ThemedText style={styles.tokenCurrencyBold}>wBTC</ThemedText>
                    <ThemedText style={[styles.tokenAmountGrey, { color: textSecondary }]}>
                      {isLoading && !balances.has(wbtcToken.address)
                        ? "…"
                        : wbtcBalance
                          ? formatBalanceNumber(wbtcBalance)
                          : "—"}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.tokenBalanceRight}>
                  <ThemedText style={styles.tokenUsdBold}>
                    {isLoading && !balances.has(wbtcToken.address)
                      ? "…"
                      : wbtcBalance && isSepolia
                        ? `$${(parseBalanceToNumber(wbtcBalance) * SEPOLIA_USD_RATES.WBTC).toLocaleString("default", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                  </ThemedText>
                  <ThemedText style={[styles.tokenRateGrey, { color: textSecondary }]}>
                    * {SEPOLIA_USD_RATES.WBTC.toLocaleString()} USD
                  </ThemedText>
                </View>
              </View>
            <View style={[styles.primaryDivider, { backgroundColor: borderColor }]} />
              <View style={styles.tokenBalanceRow}>
                <View style={styles.tokenBalanceLeft}>
                  <TinyTokenLogo token={usdcToken} />
                  <View style={styles.tokenBalanceStack}>
                    <ThemedText style={styles.tokenCurrencyBold}>USDC</ThemedText>
                    <ThemedText style={[styles.tokenAmountGrey, { color: textSecondary }]}>
                      {isLoading && !balances.has(usdcToken.address)
                        ? "…"
                        : usdcBalance
                          ? formatBalanceNumber(usdcBalance)
                          : "—"}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.tokenBalanceRight}>
                  <ThemedText style={styles.tokenUsdBold}>
                    {isLoading && !balances.has(usdcToken.address)
                      ? "…"
                      : usdcBalance && isSepolia
                        ? `$${(parseBalanceToNumber(usdcBalance) * SEPOLIA_USD_RATES.USDC).toLocaleString("default", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                  </ThemedText>
                  <ThemedText style={[styles.tokenRateGrey, { color: textSecondary }]}>
                    * {SEPOLIA_USD_RATES.USDC} USD
                  </ThemedText>
                </View>
              </View>
          </View>
          </View>

          {/* See more tokens: inside card, below USDC, above rates note */}
          <View style={[styles.seeMoreWrap, styles.seeMoreWrapInCard, { borderColor }]}>
            <TouchableOpacity
              style={styles.seeMoreRow}
              onPress={() => setShowMoreTokens((v) => !v)}
              activeOpacity={0.88}
            >
              <ThemedText style={[styles.seeMoreLabel, { color: textSecondary }]}>
                {showMoreTokens ? "Hide" : "See more tokens"}
              </ThemedText>
              <ThemedText style={[styles.seeMoreChevron, { color: textSecondary }]}>
                {showMoreTokens ? "▲" : "▼"}
              </ThemedText>
            </TouchableOpacity>
            {showMoreTokens && moreTokens.length > 0 && (
              <View style={[styles.moreTokensInner, { borderTopColor: borderColor }]}>
                {moreTokens.map((token) => {
                  const balance = getBalance(token);
                  const loading = isLoading && !balances.has(token.address);
                  return (
                    <View key={token.address} style={styles.moreTokenRow}>
                      <View style={styles.moreTokenLeft}>
                        <TinyTokenLogo token={token} />
                        <ThemedText style={[styles.moreTokenSymbol, { color: textSecondary }]}>
                          {token.symbol}
                        </ThemedText>
                      </View>
                      {loading ? (
                        <ActivityIndicator size="small" color={primaryColor} />
                      ) : (
                        <ThemedText style={styles.moreTokenAmount}>
                          {balance ? balance.toFormatted(true) : "—"}
                        </ThemedText>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <ThemedText style={[styles.usdRatesNote, { color: textSecondary }]}>
            Rates (Sepolia): 1 USDC = 1 USD, 1 STRK = 0.05 USD.{"\n"}Hardcoded for demo.
          </ThemedText>
        </View>

        {isDeployed === false && (
          <View style={[styles.deployCard, { backgroundColor: cardBg, borderColor }]}>
            <ThemedText style={[styles.deployCardMessage, { color: textSecondary }]}>
              Deployment requires STRK token.{" "}
              <ThemedText style={[styles.claimStrkLink, { color: textSecondary }]} onPress={handleClaimStrk}>
                Claim test STRK
              </ThemedText>
              , and deploy account before accessing other features.
            </ThemedText>
            <ThemedText style={styles.deployCardWarning}>
              Account not deployed
            </ThemedText>
            <TouchableOpacity
              style={[styles.deployBtnSmall, isConnecting && styles.deployBtnDisabled]}
              onPress={() => void deploy()}
              disabled={isConnecting}
              activeOpacity={0.85}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.deployBtnSmallText}>Deploy account</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <LogsFAB />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
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
  addressStatusTag: {
    fontSize: 10,
    fontWeight: "600",
  },
  tokenAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  claimStrkLinkWrap: {
    marginLeft: 4,
  },
  claimStrkLink: {
    fontSize: 12,
    textDecorationLine: "underline",
  },
  usdRatesNote: {
    fontSize: 9,
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  balanceCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    paddingTop: 8,
    marginBottom: 12,
    alignSelf: "stretch",
    alignItems: "center",
  },
  balanceCardDivider: {
    height: 1,
    width: "100%",
    marginVertical: 12,
  },
  balanceSection: {
    alignSelf: "stretch",
    width: "100%",
  },
  cardLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  primaryBalances: {
    gap: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  tokenBalanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  tokenBalanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  tokenBalanceStack: {
    gap: 2,
  },
  tokenCurrencyBold: {
    fontSize: 15,
    fontWeight: "700",
  },
  tokenAmountGrey: {
    fontSize: 13,
  },
  tokenBalanceRight: {
    alignItems: "flex-end",
  },
  tokenUsdBold: {
    fontSize: 15,
    fontWeight: "700",
  },
  tokenRateGrey: {
    fontSize: 11,
    marginTop: 2,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 8,
    gap: 10,
  },
  primaryRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryDivider: {
    height: 1,
    width: "100%",
  },
  primarySymbol: {
    fontSize: 15,
    fontWeight: "600",
  },
  primaryAmount: {
    fontSize: 15,
    fontWeight: "500",
  },
  seeMoreWrap: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  seeMoreWrapInCard: {
    alignSelf: "stretch",
    marginTop: 4,
    marginBottom: 12,
  },
  seeMoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  seeMoreLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  seeMoreChevron: {
    fontSize: 10,
  },
  moreTokensInner: {
    borderTopWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  moreTokenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  moreTokenLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tinyLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  tinyLogoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  tinyLogoText: {
    fontSize: 10,
    fontWeight: "600",
  },
  moreTokenSymbol: {
    fontSize: 11,
    fontWeight: "600",
  },
  moreTokenAmount: {
    fontSize: 11,
    fontWeight: "500",
  },
  deployCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignSelf: "stretch",
    alignItems: "center",
  },
  deployCardMessage: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  deployCardWarning: {
    fontSize: 10,
    fontWeight: "500",
    color: "#dc2626",
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  statusDeployed: {
    color: "#22c55e",
  },
  statusNotDeployed: {
    color: "#ef4444",
  },
  deployBtnSmall: {
    alignSelf: "center",
    backgroundColor: "#000",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
  },
  deployBtnDisabled: {
    opacity: 0.6,
  },
  deployBtnSmallText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});
