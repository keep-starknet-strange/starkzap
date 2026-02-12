import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useWalletStore, NETWORKS } from "@/stores/wallet";

export function NetworkBadge() {
  const chainId = useWalletStore((state) => state.chainId);
  const network = NETWORKS.find(
    (n) => n.chainId.toLiteral() === chainId.toLiteral()
  );

  return (
    <View style={styles.badge}>
      <View
        style={[
          styles.dot,
          chainId.isMainnet() ? styles.dotMainnet : styles.dotTestnet,
        ]}
      />
      <ThemedText style={styles.text}>{network?.name || "Custom"}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(128, 128, 128, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotMainnet: {
    backgroundColor: "#28a745",
  },
  dotTestnet: {
    backgroundColor: "#ffc107",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
