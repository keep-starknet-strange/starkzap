import { StyleSheet, View, Image, TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

interface ValidatorItemProps {
  name: string;
  logoUrl?: string;
  commission?: number;
  isStaked?: boolean;
  stakedAmount?: string;
  onPress: () => void;
}

export function ValidatorItem({
  name,
  logoUrl,
  commission,
  isStaked,
  stakedAmount,
  onPress,
}: ValidatorItemProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <ThemedView style={styles.container}>
        <View style={styles.leftSection}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logo} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <ThemedText style={styles.logoPlaceholderText}>
                {name.slice(0, 2)}
              </ThemedText>
            </View>
          )}
          <View style={styles.validatorInfo}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {name}
            </ThemedText>
            {commission !== undefined && (
              <ThemedText style={styles.commission}>
                Commission: {commission.toFixed(1)}%
              </ThemedText>
            )}
          </View>
        </View>
        <View style={styles.rightSection}>
          {isStaked && (
            <View style={styles.stakedBadge}>
              <ThemedText style={styles.stakedBadgeText}>Staked</ThemedText>
            </View>
          )}
          {stakedAmount && (
            <ThemedText style={styles.stakedAmount}>{stakedAmount}</ThemedText>
          )}
        </View>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    marginBottom: 8,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(128, 128, 128, 0.2)",
  },
  logoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(128, 128, 128, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  logoPlaceholderText: {
    fontSize: 16,
    fontWeight: "600",
    opacity: 0.7,
  },
  validatorInfo: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  commission: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  rightSection: {
    alignItems: "flex-end",
  },
  stakedBadge: {
    backgroundColor: "#28a745",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stakedBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  stakedAmount: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
});
