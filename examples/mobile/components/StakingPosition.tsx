import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import type { PoolMember } from "x";

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
      <ThemedText type="subtitle" style={styles.title}>
        Position
      </ThemedText>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Staked</ThemedText>
        <ThemedText style={styles.value}>
          {position.staked.toFormatted(true)}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Unclaimed Rewards</ThemedText>
        <ThemedText style={[styles.value, hasRewards && styles.rewardsValue]}>
          {position.rewards.toFormatted(true)}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Total Position</ThemedText>
        <ThemedText style={styles.value}>
          {position.total.toFormatted(true)}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Commission</ThemedText>
        <ThemedText style={styles.value}>
          {position.commissionPercent}%
        </ThemedText>
      </View>

      {hasUnpooling && (
        <View style={styles.row}>
          <ThemedText style={styles.label}>Unpooling</ThemedText>
          <ThemedText style={styles.value}>
            {position.unpooling.toFormatted(true)}
          </ThemedText>
        </View>
      )}

      {unpoolStatus && (
        <View style={styles.row}>
          <ThemedText style={styles.label}>Unpool Time</ThemedText>
          <View style={styles.unpoolTimeValue}>
            <ThemedText
              style={[styles.value, unpoolStatus.isReady && styles.readyValue]}
            >
              {unpoolStatus.text}
            </ThemedText>
            {unpoolStatus.isReady && position.unpoolTime && (
              <ThemedText style={styles.timestampText}>
                {position.unpoolTime.toLocaleString()}
              </ThemedText>
            )}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        {hasRewards && onClaimRewards && (
          <TouchableOpacity
            style={[styles.button, styles.claimButton]}
            onPress={onClaimRewards}
            disabled={isClaimingRewards}
          >
            {isClaimingRewards ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.buttonText}>Claim Rewards</ThemedText>
            )}
          </TouchableOpacity>
        )}

        {onAddStake && (
          <TouchableOpacity
            style={[styles.button, styles.addStakeButton]}
            onPress={onAddStake}
          >
            <ThemedText style={styles.buttonText}>Add Stake</ThemedText>
          </TouchableOpacity>
        )}

        {/* Show Exit button if ready to unstake, otherwise show Exit Intent */}
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
        ) : (
          hasStake &&
          !hasUnpooling &&
          onExitIntent && (
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
          )
        )}
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
    marginBottom: 12,
  },
  loading: {
    textAlign: "center",
    opacity: 0.5,
    paddingVertical: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  label: {
    fontSize: 14,
    opacity: 0.7,
  },
  value: {
    fontSize: 14,
    fontWeight: "500",
  },
  rewardsValue: {
    color: "#28a745",
  },
  readyValue: {
    color: "#28a745",
    fontWeight: "600",
  },
  unpoolTimeValue: {
    alignItems: "flex-end",
  },
  timestampText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  button: {
    flex: 1,
    minWidth: "45%",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  claimButton: {
    backgroundColor: "#28a745",
  },
  addStakeButton: {
    backgroundColor: "#0a7ea4",
  },
  exitIntentButton: {
    backgroundColor: "#f0ad4e",
  },
  exitButton: {
    backgroundColor: "#dc3545",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
