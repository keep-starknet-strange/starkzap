import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

interface PositionCardProps {
  validatorName: string;
  staked: string;
  rewards: string;
  total: string;
  unpooling?: string;
  unpoolTime?: Date | null;
  isClaimLoading?: boolean;
  isExitLoading?: boolean;
  onClaimRewards: () => void;
  onExitIntent: () => void;
  hasRewards: boolean;
}

export function PositionCard({
  validatorName,
  staked,
  rewards,
  total,
  unpooling,
  unpoolTime,
  isClaimLoading,
  isExitLoading,
  onClaimRewards,
  onExitIntent,
  hasRewards,
}: PositionCardProps) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Your Position</ThemedText>
      <ThemedText style={styles.validatorName}>{validatorName}</ThemedText>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel}>Staked</ThemedText>
          <ThemedText style={styles.statValue}>{staked}</ThemedText>
        </View>
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel}>Rewards</ThemedText>
          <ThemedText style={[styles.statValue, styles.rewardsValue]}>
            {rewards}
          </ThemedText>
        </View>
        <View style={styles.statItem}>
          <ThemedText style={styles.statLabel}>Total</ThemedText>
          <ThemedText style={styles.statValue}>{total}</ThemedText>
        </View>
      </View>

      {unpooling && (
        <View style={styles.unpoolingContainer}>
          <ThemedText style={styles.unpoolingLabel}>Unpooling</ThemedText>
          <ThemedText style={styles.unpoolingValue}>{unpooling}</ThemedText>
          {unpoolTime && (
            <ThemedText style={styles.unpoolTime}>
              Available: {unpoolTime.toLocaleDateString()}
            </ThemedText>
          )}
        </View>
      )}

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.claimButton,
            !hasRewards && styles.buttonDisabled,
          ]}
          onPress={onClaimRewards}
          disabled={!hasRewards || isClaimLoading}
        >
          {isClaimLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <ThemedText style={styles.actionButtonText}>
              Claim Rewards
            </ThemedText>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.exitButton]}
          onPress={onExitIntent}
          disabled={isExitLoading}
        >
          {isExitLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <ThemedText style={styles.actionButtonText}>Exit Intent</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 4,
  },
  validatorName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  rewardsValue: {
    color: "#28a745",
  },
  unpoolingContainer: {
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  unpoolingLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  unpoolingValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  unpoolTime: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  claimButton: {
    backgroundColor: "#28a745",
  },
  exitButton: {
    backgroundColor: "#dc3545",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
