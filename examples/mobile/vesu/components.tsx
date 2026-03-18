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

import type {
  LendingHealth,
  LendingUserPosition,
  Token,
} from "@starkzap/native";
import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  formatVesuLtv,
  formatVesuUsdValue,
  getVesuPoolVisual,
  getVesuPositionBadgeLabel,
  type VesuMarketCard,
} from "@/vesu";

// ---------------------------------------------------------------------------
// TokenAvatar
// ---------------------------------------------------------------------------

export function TokenAvatar(props: { token: Token; size?: number }) {
  const [imageError, setImageError] = useState(false);
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const size = props.size ?? 20;
  const hasImage = !!props.token.metadata?.logoUrl && !imageError;

  if (hasImage) {
    return (
      <Image
        source={{ uri: props.token.metadata!.logoUrl!.toString() }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: borderColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ThemedText
        style={{ fontSize: Math.max(10, size / 2.2), color: primaryColor }}
      >
        {props.token.symbol.charAt(0)}
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PoolAvatar
// ---------------------------------------------------------------------------

export function PoolAvatar(props: { poolLabel: string; size?: number }) {
  const size = props.size ?? 18;
  const visual = getVesuPoolVisual(props.poolLabel);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: visual.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ThemedText
        style={{
          color: visual.foregroundColor,
          fontSize: Math.max(8, size / 2.6),
          fontWeight: "800",
          letterSpacing: 0.2,
        }}
      >
        {visual.shortLabel}
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// MetricsGrid
// ---------------------------------------------------------------------------

export function MetricsGrid(props: { card: VesuMarketCard }) {
  const textSecondary = useThemeColor({}, "textSecondary");
  const { card } = props;
  const metrics = [
    ["Total supplied", card.totalSuppliedLabel],
    ["Total borrowed", card.totalBorrowedLabel],
    ["Supply APR", card.supplyAprLabel],
    ["Borrow APR", card.borrowAprLabel],
  ] as const;

  return (
    <View style={styles.metricsGrid}>
      {metrics.map(([label, value]) => (
        <View key={label} style={styles.metricCell}>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {label}
          </ThemedText>
          <ThemedText style={styles.metricValue}>{value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// MarketCardView
// ---------------------------------------------------------------------------

export function MarketCardView(props: {
  card: VesuMarketCard;
  isSelected: boolean;
  onPress: () => void;
  width: string;
  userPosition?: LendingUserPosition | null;
}) {
  const borderColor = useThemeColor({}, "border");
  const textSecondary = useThemeColor({}, "textSecondary");
  const cardBg = useThemeColor({}, "card");
  const { card, isSelected, userPosition } = props;

  return (
    <TouchableOpacity
      style={[
        styles.marketCard,
        {
          borderColor: isSelected
            ? "#000"
            : userPosition
              ? "#4ade80"
              : borderColor,
          backgroundColor: cardBg,
          width: props.width as never,
        },
      ]}
      onPress={props.onPress}
      activeOpacity={0.92}
    >
      <View style={styles.marketCardHeader}>
        <View style={styles.tokenRow}>
          <TokenAvatar token={card.option.token} size={38} />
          <View style={{ gap: 2, flexShrink: 1 }}>
            <ThemedText style={styles.marketCardSymbol}>
              {card.option.token.symbol}
            </ThemedText>
            <View style={styles.poolRow}>
              <PoolAvatar poolLabel={card.poolLabel} />
              <ThemedText style={[styles.smallText, { color: textSecondary }]}>
                {card.poolLabel}
              </ThemedText>
            </View>
          </View>
        </View>
        {isSelected && (
          <View style={[styles.selectedPill, { backgroundColor: "#000" }]}>
            <ThemedText style={styles.selectedPillText}>Open</ThemedText>
          </View>
        )}
      </View>

      {userPosition && (
        <View style={styles.positionBadge}>
          <Ionicons name="wallet-outline" size={12} color="#15803d" />
          <ThemedText style={styles.positionBadgeText}>
            {getVesuPositionBadgeLabel(userPosition)}
          </ThemedText>
        </View>
      )}

      <MetricsGrid card={card} />

      <View style={{ gap: 8 }}>
        <ThemedText style={[styles.smallText, { color: textSecondary }]}>
          Collateral
        </ThemedText>
        {card.option.canBorrow ? (
          <View style={styles.collateralRow}>
            {card.collateralTokens.length > 0 ? (
              card.collateralTokens.map((token, i) => (
                <View
                  key={`${card.key}:${token.address}`}
                  style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 999 }}
                >
                  <TokenAvatar token={token} size={24} />
                </View>
              ))
            ) : (
              <ThemedText style={[styles.smallText, { color: textSecondary }]}>
                Same-pool collateral metadata unavailable
              </ThemedText>
            )}
          </View>
        ) : (
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            Borrowing of {card.option.token.symbol} not enabled
          </ThemedText>
        )}
      </View>

      <View style={styles.marketCardButton}>
        <ThemedText style={styles.marketCardButtonText}>
          Supply & Borrow {card.option.token.symbol}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// PositionHealthCard
// ---------------------------------------------------------------------------

export function PositionHealthCard(props: {
  currentStatus: string;
  health: LendingHealth | null;
  collateralAmount: string;
  debtAmount: string;
  isRefreshing: boolean;
  positionError: string | null;
  onRefresh: () => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");

  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText style={styles.cardTitle}>Position Health</ThemedText>
        <TouchableOpacity
          onPress={props.onRefresh}
          style={[styles.refreshButton, { backgroundColor: borderColor }]}
          disabled={props.isRefreshing}
          activeOpacity={0.88}
        >
          {props.isRefreshing ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Ionicons name="refresh" size={14} color={primaryColor} />
          )}
        </TouchableOpacity>
      </View>

      {props.positionError && (
        <ThemedText style={styles.errorText}>{props.positionError}</ThemedText>
      )}

      <View style={styles.metricsRowPair}>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            Status
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {props.currentStatus}
          </ThemedText>
        </View>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            LTV
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {formatVesuLtv(props.health)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metricsRowPair}>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            Collateral
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {props.collateralAmount}
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {formatVesuUsdValue(props.health?.collateralValue)}
          </ThemedText>
        </View>
        <View style={styles.metricCard}>
          <ThemedText style={[styles.metricLabel, { color: textSecondary }]}>
            Debt
          </ThemedText>
          <ThemedText style={styles.metricValueBold}>
            {props.debtAmount}
          </ThemedText>
          <ThemedText style={[styles.smallText, { color: textSecondary }]}>
            {formatVesuUsdValue(props.health?.debtValue)}
          </ThemedText>
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// AmountField
// ---------------------------------------------------------------------------

export function AmountField(props: {
  label: string;
  hint: string;
  value: string;
  error: string | null;
  onChangeText: (v: string) => void;
  maxValue?: string;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.amountLabelRow}>
        <ThemedText style={[styles.label, { color: textSecondary }]}>
          {props.label}
        </ThemedText>
        <ThemedText style={[styles.smallText, { color: textSecondary }]}>
          {props.hint}
        </ThemedText>
      </View>
      <View style={[styles.amountRow, { borderColor }]}>
        <TextInput
          style={[styles.amountInput, { color: primaryColor }]}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder="0.0"
          placeholderTextColor={textSecondary}
          keyboardType="decimal-pad"
        />
        {!!props.maxValue && (
          <TouchableOpacity
            style={[styles.maxButton, { backgroundColor: borderColor }]}
            onPress={() => props.onChangeText(props.maxValue!)}
            activeOpacity={0.88}
          >
            <ThemedText style={[styles.maxButtonText, { color: primaryColor }]}>
              MAX
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {props.error && (
        <ThemedText style={styles.errorText}>{props.error}</ThemedText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PercentField
// ---------------------------------------------------------------------------

export function PercentField(props: {
  label: string;
  hint: string;
  value: string;
  error: string | null;
  onChangeText: (v: string) => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.amountLabelRow}>
        <ThemedText style={[styles.label, { color: textSecondary }]}>
          {props.label}
        </ThemedText>
        <ThemedText style={[styles.smallText, { color: textSecondary }]}>
          {props.hint}
        </ThemedText>
      </View>
      <View style={[styles.amountRow, { borderColor }]}>
        <TextInput
          style={[styles.amountInput, { color: primaryColor }]}
          value={props.value}
          onChangeText={props.onChangeText}
          placeholder="0"
          placeholderTextColor={textSecondary}
          keyboardType="decimal-pad"
        />
        <ThemedText style={[styles.percentSuffix, { color: textSecondary }]}>
          %
        </ThemedText>
      </View>
      {props.error && (
        <ThemedText style={styles.errorText}>{props.error}</ThemedText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared styles for extracted components
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  smallText: { fontSize: 11, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "700" },
  errorText: { color: "#e53935", fontSize: 12, fontWeight: "600" },
  tokenRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  poolRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  collateralRow: { flexDirection: "row", alignItems: "center" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  refreshButton: {
    borderRadius: 8,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRowPair: { flexDirection: "row", gap: 10 },
  metricCard: { flex: 1, gap: 4 },
  metricLabel: { fontSize: 11, fontWeight: "600" },
  metricValueBold: { fontSize: 15, fontWeight: "800" },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
    columnGap: 10,
  },
  metricCell: { width: "48%", gap: 4 },
  metricValue: { fontSize: 16, fontWeight: "700" },
  marketCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 },
  marketCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  marketCardSymbol: { fontSize: 18, fontWeight: "800" },
  selectedPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedPillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  marketCardButton: {
    backgroundColor: "#dbe1ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  marketCardButtonText: { color: "#2c42c9", fontSize: 15, fontWeight: "700" },
  positionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  positionBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803d",
  },
  amountLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  amountRow: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 10,
    fontWeight: "600",
  },
  percentSuffix: {
    fontSize: 16,
    fontWeight: "700",
    paddingLeft: 8,
  },
  maxButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  maxButtonText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
