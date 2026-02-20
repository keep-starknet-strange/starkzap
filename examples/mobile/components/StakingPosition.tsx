import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import type { PoolMember } from "starkzap";

interface StakingPositionProps {
  position: PoolMember | null;
  isLoading?: boolean;
  onClaimRewards?: () => void;
  onAddStake?: () => void;
  onExitIntent?: () => void;
  onExit?: () => void;
  isClaimingRewards?: boolean;
  isExiting?: boolean;
}

/**
 * Format the time difference between now and the unpool time.
 * Returns "Ready to unstake" if time has passed, or "in X minutes/hours/days" if in future.
 */
function formatUnpoolTime(unpoolTime: Date): {
  text: string;
  isReady: boolean;
} {
  const now = new Date();
  const diffMs = unpoolTime.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { text: "Ready to unstake", isReady: true };
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      text: `in ${diffDays} day${diffDays > 1 ? "s" : ""}`,
      isReady: false,
    };
  }
  if (diffHours > 0) {
    return {
      text: `in ${diffHours} hour${diffHours > 1 ? "s" : ""}`,
      isReady: false,
    };
  }
  return {
    text: `in ${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`,
    isReady: false,
  };
}

export function StakingPosition({
  position,
  isLoading,
  onClaimRewards,
  onAddStake,
  onExitIntent,
  onExit,
  isClaimingRewards,
  isExiting,
}: StakingPositionProps) {
  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.loading}>Loading position...</ThemedText>
      </ThemedView>
    );
  }

  if (!position) {
    return null;
  }

  const hasRewards = position.rewards && !position.rewards.isZero();
  const hasUnpooling = position.unpooling && !position.unpooling.isZero();
  const hasStake = !position.staked.isZero();

  // Determine unpool time status
  const unpoolStatus = position.unpoolTime
    ? formatUnpoolTime(position.unpoolTime)
    : null;
  const canExit = unpoolStatus?.isReady ?? false;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.oneLineRow}>
        <View style={styles.statChip}>
          <ThemedText style={styles.statLabel}>Staked</ThemedText>
          <ThemedText style={styles.statValue}>
            {position.staked.toFormatted(true)}
          </ThemedText>
        </View>
        <View style={styles.statChip}>
          <ThemedText style={styles.statLabel}>Rewards</ThemedText>
          <ThemedText
            style={[styles.statValue, hasRewards && styles.rewardsValue]}
          >
            {position.rewards.toFormatted(true)}
          </ThemedText>
        </View>
        <View style={styles.statChip}>
          <ThemedText style={styles.statLabel}>Total</ThemedText>
          <ThemedText style={styles.statValue}>
            {position.total.toFormatted(true)}
          </ThemedText>
        </View>
        <View style={styles.statChip}>
          <ThemedText style={styles.statLabel}>Commission</ThemedText>
          <ThemedText style={styles.statValue}>
            {position.commissionPercent}%
          </ThemedText>
        </View>
        {hasUnpooling && (
          <View style={styles.statChip}>
            <ThemedText style={styles.statLabel}>Unpooling</ThemedText>
            <ThemedText style={styles.statValue}>
              {position.unpooling.toFormatted(true)}
            </ThemedText>
          </View>
        )}
        {unpoolStatus && (
          <View style={styles.statChip}>
            <ThemedText style={styles.statLabel}>Unpool</ThemedText>
            <ThemedText
              style={[
                styles.statValue,
                unpoolStatus.isReady && styles.readyValue,
              ]}
            >
              {unpoolStatus.text}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {hasRewards && onClaimRewards && (
          <TouchableOpacity
            style={[styles.button, styles.claimButton]}
            onPress={onClaimRewards}
            disabled={isClaimingRewards}
          >
            {isClaimingRewards ? (
              <ActivityIndicator color="#111827" size="small" />
            ) : (
              <ThemedText style={styles.whiteButtonText}>Claim</ThemedText>
            )}
          </TouchableOpacity>
        )}

        {onAddStake && (
          <TouchableOpacity
            style={[styles.button, styles.addStakeButton]}
            onPress={onAddStake}
          >
            <ThemedText style={styles.whiteButtonText}>Add Stake</ThemedText>
          </TouchableOpacity>
        )}

        {/* Show Exit only when ready to unstake (cooldown passed); otherwise show Exit Intent when there is a stake */}
        {canExit && onExit ? (
          <TouchableOpacity
            style={[styles.button, styles.exitButton]}
            onPress={onExit}
            disabled={isExiting}
          >
            {isExiting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.buttonText}>Exit</ThemedText>
            )}
          </TouchableOpacity>
        ) : null}

        {!canExit && hasStake && !hasUnpooling && onExitIntent ? (
          <TouchableOpacity
            style={[styles.button, styles.exitIntentButton]}
            onPress={onExitIntent}
            disabled={isExiting}
          >
            {isExiting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.buttonText}>Exit Intent</ThemedText>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 10,
    marginBottom: 0,
  },
  loading: {
    textAlign: "center",
    opacity: 0.5,
    paddingVertical: 20,
  },
  oneLineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    opacity: 0.7,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 11,
    fontWeight: "600",
  },
  rewardsValue: {
    color: "#28a745",
  },
  readyValue: {
    color: "#28a745",
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 0,
    minHeight: 32,
    alignItems: "center",
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.25)",
    flexShrink: 0,
  },
  claimButton: {
    backgroundColor: "#fff",
    borderColor: "rgba(0, 0, 0, 0.12)",
  },
  addStakeButton: {
    backgroundColor: "#fff",
    borderColor: "rgba(0, 0, 0, 0.12)",
  },
  exitIntentButton: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  exitButton: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  buttonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  whiteButtonText: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "600",
  },
});
