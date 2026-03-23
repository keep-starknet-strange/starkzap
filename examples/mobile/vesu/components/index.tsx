import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Image,
  TextInput,
  TouchableOpacity,
  type ViewStyle,
  View,
} from "react-native";

import {
  type LendingHealth,
  type LendingUserPosition,
  type Token,
} from "starkzap-native";
import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  formatVesuLtv,
  formatVesuUsdValue,
  getVesuPoolVisual,
  getVesuPositionBadgeLabel,
  type VesuMarketCard,
} from "@/vesu";
import { styles } from "@/vesu/styles";

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

export function MarketCardView(props: {
  card: VesuMarketCard;
  isSelected: boolean;
  onPress: () => void;
  width: ViewStyle["width"];
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
          width: props.width,
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

export function SubmitButton(props: {
  label: string;
  enabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  return (
    <TouchableOpacity
      style={[
        styles.submitButton,
        props.enabled
          ? { backgroundColor: "#000" }
          : { backgroundColor: borderColor },
        !props.enabled && { opacity: 0.65 },
      ]}
      onPress={props.onPress}
      disabled={!props.enabled}
      activeOpacity={0.88}
    >
      {props.loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <ThemedText
          style={[
            styles.submitButtonText,
            { color: props.enabled ? "#fff" : primaryColor },
          ]}
        >
          {props.label}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton(props: {
  label: string;
  enabled: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const backgroundColor = useThemeColor({}, "background");
  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        { borderColor, backgroundColor },
        !props.enabled && { opacity: 0.65 },
      ]}
      onPress={props.onPress}
      disabled={!props.enabled}
      activeOpacity={0.88}
    >
      {props.loading ? (
        <ActivityIndicator size="small" color={primaryColor} />
      ) : (
        <ThemedText
          style={[styles.secondaryButtonText, { color: primaryColor }]}
        >
          {props.label}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}
