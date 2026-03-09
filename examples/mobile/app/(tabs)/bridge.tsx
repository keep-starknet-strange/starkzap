import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount, useAppKit, useProvider } from "@reown/appkit-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ConnectExternalWalletOptions,
  type Eip1193Provider,
  ExternalChain,
  fromEthereumAddress,
  type SolanaProvider,
} from "@starkzap/native";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useWalletStore } from "@/stores/wallet";

const CHAIN_LABELS: Record<ExternalChain, string> = {
  [ExternalChain.ETHEREUM]: "Ethereum",
  [ExternalChain.SOLANA]: "Solana",
};

export default function BridgeScreen() {
  const [isTokenPickerOpen, setIsTokenPickerOpen] = useState(false);

  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const bg = useThemeColor({}, "background");

  const { open, disconnect } = useAppKit();
  const { address: connectedAddress, allAccounts: connectedAccounts } =
    useAccount();
  const { provider: walletProvider, providerType } = useProvider();

  const {
    bridgeDirection,
    bridgeExternalChain,
    bridgeSelectedToken,
    bridgeDepositBalance,
    bridgeDepositBalanceUnit,
    bridgeDepositBalanceLoading,
    bridgeAllowance,
    bridgeAllowanceLoading,
    bridgeTokens: tokens,
    bridgeIsLoading: isLoading,
    bridgeError: error,
    connectedEthWallet,
    connectedSolWallet,
    connectExternalWallet,
    disconnectExternalWallets,
    setBridgeExternalChain,
    toggleBridgeDirection,
    selectBridgeToken,
    fetchBridgeTokens,
    fetchBridgeDepositBalance,
    fetchBridgeAllowance,
    fetchBridgeDepositFeeEstimate,
    bridgeDepositFeeEstimate,
    bridgeDepositFeeLoading,
  } = useWalletStore((state) => state);

  useEffect(() => {
    void fetchBridgeTokens();
  }, [bridgeExternalChain, fetchBridgeTokens]);

  useEffect(() => {
    if (bridgeSelectedToken) {
      void fetchBridgeDepositBalance();
    }
  }, [
    bridgeSelectedToken,
    bridgeDirection,
    connectedEthWallet,
    connectedSolWallet,
    fetchBridgeDepositBalance,
  ]);

  useEffect(() => {
    if (bridgeSelectedToken && bridgeDirection === "to-starknet") {
      void fetchBridgeAllowance();
    }
  }, [
    bridgeSelectedToken,
    bridgeDirection,
    connectedEthWallet,
    connectedSolWallet,
    fetchBridgeAllowance,
  ]);

  useEffect(() => {
    if (bridgeSelectedToken && bridgeDirection === "to-starknet") {
      void fetchBridgeDepositFeeEstimate();
    }
  }, [
    bridgeSelectedToken,
    bridgeDirection,
    connectedEthWallet,
    fetchBridgeDepositFeeEstimate,
  ]);

  const prevAddressRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prevAddress = prevAddressRef.current;
    prevAddressRef.current = connectedAddress;

    if (!connectedAddress || !walletProvider) {
      if (prevAddress) {
        disconnectExternalWallets();
      }
      return;
    }

    const connectedAccount = connectedAccounts.find(
      (a) => a.address === connectedAddress
    );
    if (!connectedAccount) return;

    let options: ConnectExternalWalletOptions | undefined;

    if (providerType === "eip155") {
      options = {
        chain: ExternalChain.ETHEREUM,
        provider: walletProvider as Eip1193Provider,
        address: fromEthereumAddress(connectedAccount.address),
        chainId: connectedAccount.chainId,
      };
    } else if (providerType === "solana") {
      options = {
        chain: ExternalChain.SOLANA,
        provider: walletProvider as unknown as SolanaProvider,
        address: connectedAccount.address,
        chainId: connectedAccount.chainId,
      };
    }

    if (options) {
      try {
        connectExternalWallet(options);
      } catch (error) {
        console.error(error);

        if (options.chain === ExternalChain.ETHEREUM) {
          disconnect("eip155");
        } else {
          disconnect("solana");
        }
      }
    }
  }, [
    connectedAccounts,
    connectedAddress,
    walletProvider,
    providerType,
    disconnect,
    connectExternalWallet,
    disconnectExternalWallets,
  ]);

  const isDepositExternal = bridgeDirection === "to-starknet";

  const [amountInput, setAmountInput] = useState("");

  useEffect(() => {
    setAmountInput("");
  }, [bridgeSelectedToken, bridgeDirection, bridgeExternalChain]);

  const amountError = useMemo(() => {
    if (!amountInput) return null;
    const parsed = parseFloat(amountInput);
    if (isNaN(parsed) || parsed <= 0) return "Amount must be greater than 0";
    if (bridgeDepositBalanceUnit) {
      const max = parseFloat(bridgeDepositBalanceUnit);
      if (!isNaN(max) && parsed > max)
        return "Amount exceeds available balance";
    }
    return null;
  }, [amountInput, bridgeDepositBalanceUnit]);

  const applyPercentage = useCallback(
    (pct: number) => {
      if (!bridgeDepositBalanceUnit) return;
      const max = parseFloat(bridgeDepositBalanceUnit);
      if (isNaN(max) || max <= 0) return;
      if (pct >= 1) {
        setAmountInput(bridgeDepositBalanceUnit);
      } else {
        const value = max * pct;
        setAmountInput(
          value
            .toFixed(bridgeSelectedToken?.decimals ?? 18)
            .replace(/\.?0+$/, "")
        );
      }
    },
    [bridgeDepositBalanceUnit, bridgeSelectedToken?.decimals]
  );

  const renderExternalChainSection = (isDeposit: boolean) => (
    <View
      style={[styles.bridgeSection, { borderColor, backgroundColor: cardBg }]}
    >
      <ThemedText style={[styles.sectionLabel, { color: textSecondary }]}>
        {isDeposit ? "From" : "To"}
      </ThemedText>

      <View style={styles.chainSelector}>
        {([ExternalChain.ETHEREUM, ExternalChain.SOLANA] as const).map(
          (chain) => (
            <TouchableOpacity
              key={chain}
              style={[
                styles.chainButton,
                {
                  borderColor,
                  backgroundColor:
                    bridgeExternalChain === chain ? `${primaryColor}15` : bg,
                },
              ]}
              onPress={() => {
                setBridgeExternalChain(chain);
                setIsTokenPickerOpen(false);
              }}
            >
              <ThemedText
                style={[
                  styles.chainButtonText,
                  {
                    color:
                      bridgeExternalChain === chain
                        ? primaryColor
                        : textSecondary,
                  },
                ]}
              >
                {CHAIN_LABELS[chain]}
              </ThemedText>
            </TouchableOpacity>
          )
        )}
      </View>

      <TouchableOpacity
        style={[styles.tokenSelector, { borderColor, backgroundColor: bg }]}
        onPress={() => setIsTokenPickerOpen((prev) => !prev)}
      >
        <ThemedText
          style={[
            styles.tokenSelectorText,
            !bridgeSelectedToken && { color: textSecondary },
          ]}
        >
          {bridgeSelectedToken
            ? `${bridgeSelectedToken.symbol} — ${bridgeSelectedToken.name}`
            : "Select a token"}
        </ThemedText>
        <ThemedText
          style={[styles.tokenSelectorArrow, { color: textSecondary }]}
        >
          {isTokenPickerOpen ? "▲" : "▼"}
        </ThemedText>
      </TouchableOpacity>

      {isTokenPickerOpen ? (
        <View style={[styles.tokenList, { borderColor }]}>
          {isLoading ? (
            <View style={styles.tokenListLoading}>
              <ActivityIndicator size="small" />
              <ThemedText
                style={[styles.tokenListLoadingText, { color: textSecondary }]}
              >
                Loading tokens…
              </ThemedText>
            </View>
          ) : error ? (
            <ThemedText style={[styles.tokenListError, { color: "#D44545" }]}>
              {error}
            </ThemedText>
          ) : tokens.length === 0 ? (
            <ThemedText
              style={[styles.tokenListEmpty, { color: textSecondary }]}
            >
              No tokens available.
            </ThemedText>
          ) : (
            tokens.map((token) => {
              const isSelected =
                bridgeSelectedToken?.id === token.id &&
                bridgeSelectedToken?.chain === token.chain;

              return (
                <TouchableOpacity
                  key={`${token.chain}-${token.id}-${token.starknetAddress}`}
                  style={[
                    styles.tokenListItem,
                    {
                      borderColor,
                      backgroundColor: isSelected
                        ? `${primaryColor}10`
                        : "transparent",
                    },
                  ]}
                  onPress={() => {
                    selectBridgeToken(token);
                    setIsTokenPickerOpen(false);
                  }}
                >
                  <View style={styles.tokenListItemContent}>
                    <ThemedText style={styles.tokenListSymbol}>
                      {token.symbol}
                    </ThemedText>
                    <ThemedText
                      style={[styles.tokenListName, { color: textSecondary }]}
                    >
                      {token.name}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[styles.tokenListProtocol, { color: textSecondary }]}
                  >
                    {token.protocol}
                  </ThemedText>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : null}

      {isDeposit && bridgeSelectedToken ? (
        <View style={styles.balanceRow}>
          <ThemedText style={[styles.balanceLabel, { color: textSecondary }]}>
            Balance:
          </ThemedText>
          {bridgeDepositBalanceLoading ? (
            <ActivityIndicator size="small" />
          ) : (
            <ThemedText style={styles.balanceValue}>
              {bridgeDepositBalance ?? "—"}
            </ThemedText>
          )}
        </View>
      ) : null}

      {isDeposit && bridgeSelectedToken && bridgeDirection === "to-starknet" ? (
        <View style={styles.balanceRow}>
          <ThemedText style={[styles.balanceLabel, { color: textSecondary }]}>
            Allowance:
          </ThemedText>
          {bridgeAllowanceLoading ? (
            <ActivityIndicator size="small" />
          ) : (
            <ThemedText style={styles.balanceValue}>
              {bridgeAllowance ?? "—"}
            </ThemedText>
          )}
        </View>
      ) : null}

      {isDeposit && bridgeSelectedToken ? (
        <View style={styles.amountBlock}>
          <TextInput
            style={[
              styles.amountInput,
              {
                borderColor: amountError ? "#D44545" : borderColor,
                backgroundColor: bg,
                color: amountError ? "#D44545" : undefined,
              },
            ]}
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="0.0"
            placeholderTextColor={textSecondary}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          {amountError ? (
            <ThemedText style={styles.amountError}>{amountError}</ThemedText>
          ) : null}
          <View style={styles.percentRow}>
            {([25, 50, 75, 100] as const).map((pct) => (
              <TouchableOpacity
                key={pct}
                style={[
                  styles.percentButton,
                  {
                    borderColor,
                    backgroundColor: `${primaryColor}10`,
                  },
                ]}
                disabled={!bridgeDepositBalanceUnit}
                onPress={() => applyPercentage(pct / 100)}
              >
                <ThemedText
                  style={[
                    styles.percentButtonText,
                    {
                      color: bridgeDepositBalanceUnit
                        ? primaryColor
                        : textSecondary,
                    },
                  ]}
                >
                  {pct === 100 ? "MAX" : `${pct}%`}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderStarknetSection = (isDeposit: boolean) => (
    <View
      style={[styles.bridgeSection, { borderColor, backgroundColor: cardBg }]}
    >
      <ThemedText style={[styles.sectionLabel, { color: textSecondary }]}>
        {isDeposit ? "From" : "To"}
      </ThemedText>

      <View
        style={[
          styles.starknetChainBadge,
          { borderColor, backgroundColor: `${primaryColor}08` },
        ]}
      >
        <ThemedText style={styles.starknetChainText}>Starknet</ThemedText>
      </View>

      <View style={[styles.tokenDisplay, { borderColor, backgroundColor: bg }]}>
        <ThemedText
          style={[
            styles.tokenDisplayText,
            !bridgeSelectedToken && { color: textSecondary },
          ]}
        >
          {bridgeSelectedToken
            ? `${bridgeSelectedToken.symbol} — ${bridgeSelectedToken.name}`
            : "Select a token on the other chain"}
        </ThemedText>
      </View>

      {bridgeSelectedToken ? (
        <ThemedText style={[styles.starknetAddress, { color: textSecondary }]}>
          L2:{" "}
          {`${bridgeSelectedToken.starknetAddress.slice(0, 10)}…${bridgeSelectedToken.starknetAddress.slice(-8)}`}
        </ThemedText>
      ) : null}

      {isDeposit && bridgeSelectedToken ? (
        <View style={styles.balanceRow}>
          <ThemedText style={[styles.balanceLabel, { color: textSecondary }]}>
            Balance:
          </ThemedText>
          {bridgeDepositBalanceLoading ? (
            <ActivityIndicator size="small" />
          ) : (
            <ThemedText style={styles.balanceValue}>
              {bridgeDepositBalance ?? "—"}
            </ThemedText>
          )}
        </View>
      ) : null}

      {isDeposit && bridgeSelectedToken ? (
        <View style={styles.amountBlock}>
          <TextInput
            style={[
              styles.amountInput,
              {
                borderColor: amountError ? "#D44545" : borderColor,
                backgroundColor: bg,
                color: amountError ? "#D44545" : undefined,
              },
            ]}
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="0.0"
            placeholderTextColor={textSecondary}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          {amountError ? (
            <ThemedText style={styles.amountError}>{amountError}</ThemedText>
          ) : null}
          <View style={styles.percentRow}>
            {([25, 50, 75, 100] as const).map((pct) => (
              <TouchableOpacity
                key={pct}
                style={[
                  styles.percentButton,
                  {
                    borderColor,
                    backgroundColor: `${primaryColor}10`,
                  },
                ]}
                disabled={!bridgeDepositBalanceUnit}
                onPress={() => applyPercentage(pct / 100)}
              >
                <ThemedText
                  style={[
                    styles.percentButtonText,
                    {
                      color: bridgeDepositBalanceUnit
                        ? primaryColor
                        : textSecondary,
                    },
                  ]}
                >
                  {pct === 100 ? "MAX" : `${pct}%`}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

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
              {connectedEthWallet || connectedSolWallet
                ? "Change Wallet"
                : "Connect Wallet"}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {connectedEthWallet || connectedSolWallet ? (
          <View style={{ gap: 8 }}>
            {connectedEthWallet ? (
              <View style={[styles.connectionCard, { borderColor }]}>
                <ThemedText style={styles.connectionTitle}>
                  Ethereum Wallet
                </ThemedText>
                <ThemedText
                  style={[styles.connectionLine, { color: textSecondary }]}
                >
                  Address:{" "}
                  {`${connectedEthWallet.address.slice(0, 6)}...${connectedEthWallet.address.slice(-4)}`}
                </ThemedText>
              </View>
            ) : null}
            {connectedSolWallet ? (
              <View style={[styles.connectionCard, { borderColor }]}>
                <ThemedText style={styles.connectionTitle}>
                  Solana Wallet
                </ThemedText>
                <ThemedText
                  style={[styles.connectionLine, { color: textSecondary }]}
                >
                  Address:{" "}
                  {`${connectedSolWallet.address.slice(0, 6)}...${connectedSolWallet.address.slice(-4)}`}
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          <ThemedText
            style={[styles.disconnectedHint, { color: textSecondary }]}
          >
            No external wallet connected.
          </ThemedText>
        )}

        <View style={styles.bridgeForm}>
          {isDepositExternal
            ? renderExternalChainSection(true)
            : renderStarknetSection(true)}

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[
                styles.toggleDirectionButton,
                { borderColor, backgroundColor: `${primaryColor}12` },
              ]}
              onPress={() => {
                toggleBridgeDirection();
                setIsTokenPickerOpen(false);
              }}
            >
              <ThemedText
                style={[styles.toggleDirectionText, { color: primaryColor }]}
              >
                ⇅
              </ThemedText>
            </TouchableOpacity>
          </View>

          {isDepositExternal
            ? renderStarknetSection(false)
            : renderExternalChainSection(false)}
        </View>

        {bridgeDirection === "to-starknet" && bridgeSelectedToken ? (
          <View
            style={[
              styles.feeSection,
              { borderColor, backgroundColor: cardBg },
            ]}
          >
            <ThemedText
              style={[styles.feeSectionTitle, { color: textSecondary }]}
            >
              Estimated Fees
            </ThemedText>
            {bridgeDepositFeeLoading ? (
              <View style={styles.feeRow}>
                <ActivityIndicator size="small" />
                <ThemedText style={[styles.feeLabel, { color: textSecondary }]}>
                  Calculating…
                </ThemedText>
              </View>
            ) : bridgeDepositFeeEstimate ? (
              <>
                <View style={styles.feeRow}>
                  <ThemedText
                    style={[styles.feeLabel, { color: textSecondary }]}
                  >
                    L1 Gas Fee
                  </ThemedText>
                  <ThemedText style={styles.feeValue}>
                    {bridgeDepositFeeEstimate.l1FeeError ??
                      bridgeDepositFeeEstimate.l1Fee.toFormatted()}
                  </ThemedText>
                </View>
                <View style={styles.feeRow}>
                  <ThemedText
                    style={[styles.feeLabel, { color: textSecondary }]}
                  >
                    L2 Message Fee
                  </ThemedText>
                  <ThemedText style={styles.feeValue}>
                    {bridgeDepositFeeEstimate.l2FeeError ??
                      bridgeDepositFeeEstimate.l2Fee.toFormatted()}
                  </ThemedText>
                </View>
                <View style={styles.feeRow}>
                  <ThemedText
                    style={[styles.feeLabel, { color: textSecondary }]}
                  >
                    Approval Fee
                  </ThemedText>
                  <ThemedText style={styles.feeValue}>
                    {bridgeDepositFeeEstimate.approvalFeeError ??
                      bridgeDepositFeeEstimate.approvalFee.toFormatted()}
                  </ThemedText>
                </View>
              </>
            ) : (
              <ThemedText style={[styles.feeLabel, { color: textSecondary }]}>
                —
              </ThemedText>
            )}
          </View>
        ) : null}
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

  // Bridge form
  bridgeForm: {
    gap: 0,
  },
  bridgeSection: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Chain selector (external)
  chainSelector: {
    flexDirection: "row",
    gap: 8,
  },
  chainButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  chainButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Starknet chain badge
  starknetChainBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  starknetChainText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Token selector (external)
  tokenSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tokenSelectorText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  tokenSelectorArrow: {
    fontSize: 10,
    marginLeft: 8,
  },

  // Token display (starknet, read-only mirror)
  tokenDisplay: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tokenDisplayText: {
    fontSize: 14,
    fontWeight: "600",
  },

  starknetAddress: {
    fontSize: 11,
    fontWeight: "500",
  },

  // Token picker dropdown
  tokenList: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  tokenListLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
  },
  tokenListLoadingText: {
    fontSize: 13,
  },
  tokenListError: {
    fontSize: 13,
    fontWeight: "600",
    padding: 14,
  },
  tokenListEmpty: {
    fontSize: 13,
    fontWeight: "500",
    padding: 14,
  },
  tokenListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tokenListItemContent: {
    flex: 1,
    gap: 1,
  },
  tokenListSymbol: {
    fontSize: 14,
    fontWeight: "700",
  },
  tokenListName: {
    fontSize: 12,
    fontWeight: "500",
  },
  tokenListProtocol: {
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 8,
  },

  // Balance row
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  balanceValue: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Amount input
  amountBlock: {
    gap: 8,
  },
  amountInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "600",
  },
  amountError: {
    fontSize: 12,
    fontWeight: "600",
    color: "#D44545",
  },
  percentRow: {
    flexDirection: "row",
    gap: 8,
  },
  percentButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  percentButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Fee section
  feeSection: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  feeSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  feeLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  feeValue: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Toggle direction
  toggleRow: {
    alignItems: "center",
    paddingVertical: 4,
    zIndex: 1,
  },
  toggleDirectionButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleDirectionText: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
  },
});
