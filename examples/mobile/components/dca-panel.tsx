import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Amount,
  type ChainId,
  type DcaProvider,
  type SwapProvider,
  type Token,
} from "starkzap";

import { ThemedText } from "@/components/themed-text";
import { WalletHeader } from "@/components/wallet-header";
import { SponsoredToggle } from "@/components/sponsored-toggle";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  DCA_FREQUENCY_OPTIONS,
  type UseDcaStateReturn,
  cropAddress,
  formatDateStamp,
  formatTokenAmount,
  getDcaFrequencyLabel,
  getDcaProviderLabel,
} from "@/hooks/use-dca-state";
import { getSwapProviderLabel } from "@/swaps";

const WBTC_LOGO_FALLBACK =
  "https://altcoinsbox.com/wp-content/uploads/2023/01/wbtc-wrapped-bitcoin-logo.png";

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
      <View
        style={[
          styles.tinyLogo,
          styles.tinyLogoPlaceholder,
          { backgroundColor: borderColor },
        ]}
      >
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

export interface DcaPanelProps {
  dca: UseDcaStateReturn;
  walletAddress: string;
  addLog: (message: string) => void;
  availableIntegrations: readonly SwapProvider[];
  availableDcaProviders: readonly DcaProvider[];
  chainId: ChainId;
  useSponsored: boolean;
  setUseSponsored: (value: boolean) => void;
  canUseSponsored: boolean;
  onOpenTokenPicker: (mode: "dca-from" | "dca-to") => void;
  tokenMetadataByAddress: Map<string, Token>;
}

export function DcaPanel({
  dca,
  walletAddress,
  addLog,
  availableIntegrations,
  availableDcaProviders,
  chainId,
  useSponsored,
  setUseSponsored,
  canUseSponsored,
  onOpenTokenPicker,
  tokenMetadataByAddress,
}: DcaPanelProps) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");

  const {
    selectedDcaProvider,
    selectedDcaPreviewProvider,
    dcaSellToken,
    dcaBuyToken,
    dcaTotalAmount,
    dcaCycleAmount,
    dcaFrequency,
    dcaPreview,
    dcaError,
    dcaOrdersError,
    dcaOrders,
    isDcaPreviewing,
    isDcaSubmitting,
    isRefreshingDcaOrders,
    cancellingDcaOrderId,
    dcaExceedsBalance,
    dcaSameToken,
    dcaCycleExceedsTotal,
    parsedDcaCycleAmount,
    dcaTotalAmountError,
    dcaCycleAmountError,
    dcaPreviewProviderLabel,
    dcaBackendLabel,
    dcaSellBalance,
    canPreviewDca,
    canCreateDca,
    handleSelectDcaProvider,
    handleSelectDcaPreviewProvider,
    handleSelectDcaFrequency,
    handleFlipDcaTokens,
    handleDcaTotalAmountChange,
    handleDcaCycleAmountChange,
    handlePreviewDca,
    handleCreateDca,
    handleCancelDcaOrder,
    refreshDcaOrders,
  } = dca;

  return (
    <>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <WalletHeader walletAddress={walletAddress} addLog={addLog} />

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Recurring Backend
          </ThemedText>
          <View style={styles.integrationRow}>
            {availableDcaProviders.map((provider) => {
              const selected = selectedDcaProvider?.id === provider.id;
              return (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.integrationPill,
                    { borderColor },
                    selected && styles.integrationPillSelected,
                  ]}
                  onPress={() => handleSelectDcaProvider(provider.id)}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[
                      styles.integrationPillText,
                      selected
                        ? styles.integrationPillTextSelected
                        : { color: textSecondary },
                    ]}
                  >
                    {getDcaProviderLabel(provider.id)}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <ThemedText style={[styles.callsHint, { color: textSecondary }]}>
            {selectedDcaProvider?.id === "ekubo"
              ? "Ekubo creates a native continuous TWAMM order."
              : "Avnu creates a discrete recurring order with optional min/max guards."}
          </ThemedText>
          {selectedDcaProvider?.id === "ekubo" && chainId.isSepolia() && (
            <ThemedText style={[styles.callsHint, { color: textSecondary }]}>
              On Sepolia, try ETH -&gt; USDC.e or WBTC -&gt; ETH for Ekubo DCA.
            </ThemedText>
          )}
        </View>

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Preview Source
          </ThemedText>
          <View style={styles.integrationRow}>
            {availableIntegrations.map((integration) => {
              const selected =
                selectedDcaPreviewProvider?.id === integration.id;
              return (
                <TouchableOpacity
                  key={integration.id}
                  style={[
                    styles.integrationPill,
                    { borderColor },
                    selected && styles.integrationPillSelected,
                  ]}
                  onPress={() => handleSelectDcaPreviewProvider(integration.id)}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[
                      styles.integrationPillText,
                      selected
                        ? styles.integrationPillTextSelected
                        : { color: textSecondary },
                    ]}
                  >
                    {getSwapProviderLabel(integration)}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <ThemedText style={[styles.callsHint, { color: textSecondary }]}>
            The selected source only affects the single-cycle preview.
          </ThemedText>
          {!availableIntegrations.length && (
            <ThemedText style={styles.errorText}>
              No preview integrations are configured for this network
            </ThemedText>
          )}
        </View>

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Sell Token
          </ThemedText>
          <TouchableOpacity
            style={[styles.tokenRow, { borderColor }]}
            onPress={() => onOpenTokenPicker("dca-from")}
            activeOpacity={0.88}
          >
            <View style={styles.tokenRowLeft}>
              <TinyTokenLogo token={dcaSellToken} />
              <View style={styles.tokenTextStack}>
                <ThemedText style={styles.tokenSymbol}>
                  {dcaSellToken.symbol}
                </ThemedText>
                <ThemedText
                  style={[styles.tokenName, { color: textSecondary }]}
                >
                  {dcaSellToken.name}
                </ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.chevronText, { color: textSecondary }]}>
              ▼
            </ThemedText>
          </TouchableOpacity>
          <ThemedText style={[styles.balanceText, { color: textSecondary }]}>
            Balance:{" "}
            {dcaSellBalance ? dcaSellBalance.toFormatted(true) : "\u2014"}
          </ThemedText>
        </View>

        <TouchableOpacity
          style={[styles.flipButton, { backgroundColor: borderColor }]}
          onPress={handleFlipDcaTokens}
          activeOpacity={0.88}
        >
          <Ionicons name="swap-vertical" size={16} color={primaryColor} />
        </TouchableOpacity>

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Buy Token
          </ThemedText>
          <TouchableOpacity
            style={[styles.tokenRow, { borderColor }]}
            onPress={() => onOpenTokenPicker("dca-to")}
            activeOpacity={0.88}
          >
            <View style={styles.tokenRowLeft}>
              <TinyTokenLogo token={dcaBuyToken} />
              <View style={styles.tokenTextStack}>
                <ThemedText style={styles.tokenSymbol}>
                  {dcaBuyToken.symbol}
                </ThemedText>
                <ThemedText
                  style={[styles.tokenName, { color: textSecondary }]}
                >
                  {dcaBuyToken.name}
                </ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.chevronText, { color: textSecondary }]}>
              ▼
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Total Sell Amount
          </ThemedText>
          <View style={[styles.amountRow, { borderColor }]}>
            <TextInput
              style={[
                styles.amountInput,
                { color: dcaExceedsBalance ? "#e53935" : primaryColor },
              ]}
              value={dcaTotalAmount}
              onChangeText={handleDcaTotalAmountChange}
              placeholder="0.0"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
            {dcaSellBalance && (
              <TouchableOpacity
                style={[styles.maxButton, { backgroundColor: borderColor }]}
                onPress={() =>
                  handleDcaTotalAmountChange(dcaSellBalance.toUnit())
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
          {dcaExceedsBalance && (
            <ThemedText style={styles.errorText}>
              Total amount exceeds {dcaSellToken.symbol} balance
            </ThemedText>
          )}
          {dcaTotalAmountError && (
            <ThemedText style={styles.errorText}>
              {dcaTotalAmountError}
            </ThemedText>
          )}
        </View>

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Per Cycle
          </ThemedText>
          <View style={[styles.amountRow, { borderColor }]}>
            <TextInput
              style={[styles.amountInput, { color: primaryColor }]}
              value={dcaCycleAmount}
              onChangeText={handleDcaCycleAmountChange}
              placeholder="0.0"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
          {dcaCycleAmountError && (
            <ThemedText style={styles.errorText}>
              {dcaCycleAmountError}
            </ThemedText>
          )}
          {dcaCycleExceedsTotal && (
            <ThemedText style={styles.errorText}>
              Per-cycle amount must be less than or equal to the total
            </ThemedText>
          )}
        </View>

        <View style={styles.fieldSection}>
          <ThemedText style={[styles.fieldLabel, { color: textSecondary }]}>
            Frequency
          </ThemedText>
          <View style={styles.integrationRow}>
            {DCA_FREQUENCY_OPTIONS.map((option) => {
              const selected = dcaFrequency === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.integrationPill,
                    { borderColor },
                    selected && styles.integrationPillSelected,
                  ]}
                  onPress={() => handleSelectDcaFrequency(option.value)}
                  activeOpacity={0.88}
                >
                  <ThemedText
                    style={[
                      styles.integrationPillText,
                      selected
                        ? styles.integrationPillTextSelected
                        : { color: textSecondary },
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <SponsoredToggle
          useSponsored={useSponsored}
          setUseSponsored={setUseSponsored}
          canUseSponsored={canUseSponsored}
          disabled={isDcaSubmitting || cancellingDcaOrderId != null}
        />

        {dcaSameToken && (
          <ThemedText style={styles.errorText}>
            Sell and buy tokens must be different
          </ThemedText>
        )}
        {dcaError && (
          <ThemedText style={styles.errorText}>{dcaError}</ThemedText>
        )}

        {dcaPreview && (
          <View style={[styles.previewCard, { backgroundColor: borderColor }]}>
            <View style={styles.previewRow}>
              <ThemedText
                style={[styles.previewLabel, { color: textSecondary }]}
              >
                Source
              </ThemedText>
              <ThemedText style={styles.previewValue}>
                {dcaPreviewProviderLabel ?? "Preview"}
              </ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText
                style={[styles.previewLabel, { color: textSecondary }]}
              >
                Backend
              </ThemedText>
              <ThemedText style={styles.previewValue}>
                {dcaBackendLabel ?? "DCA"}
              </ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText
                style={[styles.previewLabel, { color: textSecondary }]}
              >
                Sell
              </ThemedText>
              <ThemedText style={styles.previewValue}>
                {parsedDcaCycleAmount?.toFormatted(true) ?? "\u2014"}
              </ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText
                style={[styles.previewLabel, { color: textSecondary }]}
              >
                Est. Buy
              </ThemedText>
              <ThemedText style={styles.previewValue}>
                {Amount.fromRaw(
                  dcaPreview.amountOutBase,
                  dcaBuyToken.decimals,
                  dcaBuyToken.symbol
                ).toFormatted(true)}
              </ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText
                style={[styles.previewLabel, { color: textSecondary }]}
              >
                Price Impact
              </ThemedText>
              <ThemedText style={styles.previewValue}>
                {dcaPreview.priceImpactBps == null
                  ? "n/a"
                  : `${(Number(dcaPreview.priceImpactBps) / 100).toFixed(2)}%`}
              </ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText
                style={[styles.previewLabel, { color: textSecondary }]}
              >
                Route Calls
              </ThemedText>
              <ThemedText style={styles.previewValue}>
                {dcaPreview.routeCallCount != null
                  ? `${dcaPreview.routeCallCount}`
                  : "n/a"}
              </ThemedText>
            </View>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              { borderColor },
              !canPreviewDca && styles.buttonDisabled,
            ]}
            onPress={handlePreviewDca}
            disabled={!canPreviewDca}
            activeOpacity={0.85}
          >
            {isDcaPreviewing ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <ThemedText
                style={[styles.secondaryButtonText, { color: primaryColor }]}
              >
                Preview Cycle
              </ThemedText>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryActionButton,
              canCreateDca
                ? { backgroundColor: "#000" }
                : { backgroundColor: borderColor },
              !canCreateDca && styles.buttonDisabled,
            ]}
            onPress={handleCreateDca}
            disabled={!canCreateDca}
            activeOpacity={0.85}
          >
            {isDcaSubmitting ? (
              <ActivityIndicator
                size="small"
                color={canCreateDca ? "#fff" : primaryColor}
              />
            ) : (
              <ThemedText
                style={[
                  styles.primaryActionButtonText,
                  { color: canCreateDca ? "#fff" : primaryColor },
                ]}
              >
                Create DCA
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.card,
          styles.ordersCard,
          { backgroundColor: cardBg, borderColor },
        ]}
      >
        <View style={styles.ordersHeader}>
          <View style={styles.ordersHeaderText}>
            <ThemedText style={styles.ordersTitle}>DCA Orders</ThemedText>
            <ThemedText
              style={[styles.ordersSubtitle, { color: textSecondary }]}
            >
              {selectedDcaProvider
                ? `Refresh the latest ${getDcaProviderLabel(selectedDcaProvider.id)} orders for this wallet.`
                : "Select a DCA backend to load orders."}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={[
              styles.inlineButton,
              { borderColor },
              isRefreshingDcaOrders && styles.buttonDisabled,
            ]}
            onPress={() => void refreshDcaOrders()}
            disabled={isRefreshingDcaOrders}
            activeOpacity={0.88}
          >
            {isRefreshingDcaOrders ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <ThemedText
                style={[styles.inlineButtonText, { color: primaryColor }]}
              >
                Refresh
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>

        {dcaOrdersError && (
          <ThemedText style={styles.errorText}>{dcaOrdersError}</ThemedText>
        )}

        {!dcaOrders.length && !isRefreshingDcaOrders && !dcaOrdersError && (
          <ThemedText style={[styles.emptyStateText, { color: textSecondary }]}>
            {selectedDcaProvider
              ? `No ${getDcaProviderLabel(selectedDcaProvider.id)} DCA orders yet. Create one above to start recurring buys.`
              : "Select a DCA backend to load orders."}
          </ThemedText>
        )}

        {dcaOrders.map((order) => {
          const orderSellToken =
            tokenMetadataByAddress.get(order.sellTokenAddress) ?? null;
          const orderBuyToken =
            tokenMetadataByAddress.get(order.buyTokenAddress) ?? null;
          const isActiveOrder = order.status === "ACTIVE";
          const isCancelling = cancellingDcaOrderId === order.id;

          return (
            <View key={order.id} style={[styles.orderItem, { borderColor }]}>
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <ThemedText style={styles.orderPairText}>
                    {(orderSellToken?.symbol ?? "SELL") +
                      " -> " +
                      (orderBuyToken?.symbol ?? "BUY")}
                  </ThemedText>
                  <ThemedText
                    style={[styles.orderAddressText, { color: textSecondary }]}
                  >
                    {getDcaProviderLabel(order.providerId)} ·{" "}
                    {cropAddress(order.orderAddress)}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.orderStatusPill,
                    isActiveOrder
                      ? styles.orderStatusPillActive
                      : { backgroundColor: borderColor },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.orderStatusText,
                      isActiveOrder
                        ? styles.orderStatusTextActive
                        : { color: primaryColor },
                    ]}
                  >
                    {order.status}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.orderFacts}>
                <View style={styles.orderFactRow}>
                  <ThemedText
                    style={[styles.orderFactLabel, { color: textSecondary }]}
                  >
                    Total
                  </ThemedText>
                  <ThemedText style={styles.orderFactValue}>
                    {formatTokenAmount(order.sellAmountBase, orderSellToken)}
                  </ThemedText>
                </View>
                <View style={styles.orderFactRow}>
                  <ThemedText
                    style={[styles.orderFactLabel, { color: textSecondary }]}
                  >
                    Per cycle
                  </ThemedText>
                  <ThemedText style={styles.orderFactValue}>
                    {order.sellAmountPerCycleBase != null
                      ? formatTokenAmount(
                          order.sellAmountPerCycleBase,
                          orderSellToken
                        )
                      : "Continuous"}
                  </ThemedText>
                </View>
                <View style={styles.orderFactRow}>
                  <ThemedText
                    style={[styles.orderFactLabel, { color: textSecondary }]}
                  >
                    Bought
                  </ThemedText>
                  <ThemedText style={styles.orderFactValue}>
                    {formatTokenAmount(order.amountBoughtBase, orderBuyToken)}
                  </ThemedText>
                </View>
                <View style={styles.orderFactRow}>
                  <ThemedText
                    style={[styles.orderFactLabel, { color: textSecondary }]}
                  >
                    Frequency
                  </ThemedText>
                  <ThemedText style={styles.orderFactValue}>
                    {getDcaFrequencyLabel(order.frequency)}
                  </ThemedText>
                </View>
                <View style={styles.orderFactRow}>
                  <ThemedText
                    style={[styles.orderFactLabel, { color: textSecondary }]}
                  >
                    Created
                  </ThemedText>
                  <ThemedText style={styles.orderFactValue}>
                    {formatDateStamp(order.timestamp)}
                  </ThemedText>
                </View>
                <View style={styles.orderFactRow}>
                  <ThemedText
                    style={[styles.orderFactLabel, { color: textSecondary }]}
                  >
                    Trades
                  </ThemedText>
                  <ThemedText style={styles.orderFactValue}>
                    {order.executedTradesCount} done /{" "}
                    {order.pendingTradesCount} pending /{" "}
                    {order.cancelledTradesCount} cancelled
                  </ThemedText>
                </View>
              </View>

              {isActiveOrder && (
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    { borderColor },
                    isCancelling && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleCancelDcaOrder(order)}
                  disabled={isCancelling}
                  activeOpacity={0.88}
                >
                  {isCancelling ? (
                    <ActivityIndicator size="small" color={primaryColor} />
                  ) : (
                    <ThemedText
                      style={[styles.cancelButtonText, { color: primaryColor }]}
                    >
                      Cancel Order
                    </ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      <ThemedText style={[styles.hint, { color: textSecondary }]}>
        Pull down to refresh balances and DCA orders
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    width: "100%",
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 10,
  },
  amountRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 10,
  },
  balanceText: {
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  callsHint: {
    fontSize: 11,
  },
  cancelButton: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    marginTop: 6,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: "100%",
  },
  chevronText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyStateText: {
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: "#e53935",
    fontSize: 12,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  fieldSection: {
    gap: 8,
  },
  flipButton: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  hint: {
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
    width: "100%",
  },
  inlineButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    minWidth: 86,
    paddingHorizontal: 12,
  },
  inlineButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  integrationPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  integrationPillSelected: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  integrationPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  integrationPillTextSelected: {
    color: "#fff",
  },
  integrationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  maxButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  maxButtonText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  orderAddressText: {
    fontSize: 11,
  },
  orderFactLabel: {
    fontSize: 11,
  },
  orderFactRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderFactValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 12,
    textAlign: "right",
  },
  orderFacts: {
    gap: 6,
  },
  orderHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  orderItem: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  orderPairText: {
    fontSize: 14,
    fontWeight: "700",
  },
  ordersCard: {
    marginTop: 14,
  },
  ordersHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  ordersHeaderText: {
    flex: 1,
    gap: 4,
  },
  ordersSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  ordersTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  orderStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  orderStatusPillActive: {
    backgroundColor: "#000",
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  orderStatusTextActive: {
    color: "#fff",
  },
  previewCard: {
    borderRadius: 12,
    gap: 10,
    padding: 12,
  },
  previewLabel: {
    fontSize: 11,
    textTransform: "uppercase",
  },
  previewRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  previewValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  primaryActionButton: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryActionButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tinyLogo: { borderRadius: 10, height: 20, width: 20 },
  tinyLogoPlaceholder: { alignItems: "center", justifyContent: "center" },
  tinyLogoText: { fontSize: 10, fontWeight: "600" },
  tokenName: {
    fontSize: 12,
  },
  tokenRow: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tokenRowLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  tokenSymbol: {
    fontSize: 14,
    fontWeight: "700",
  },
  tokenTextStack: {
    flexDirection: "column",
  },
});
