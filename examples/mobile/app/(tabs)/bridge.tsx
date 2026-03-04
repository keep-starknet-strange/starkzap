import { StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount, useAppKit } from "@reown/appkit-react-native";

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";

export default function BridgeScreen() {
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "primary");
  const textSecondary = useThemeColor({}, "textSecondary");
  const { open } = useAppKit();
  const { address, chain, isConnected } = useAccount();

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : undefined;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
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
              {isConnected ? "Wallet Connected" : "Connect Wallet"}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {isConnected && address ? (
          <View style={[styles.connectionCard, { borderColor }]}>
            <ThemedText style={styles.connectionTitle}>
              Connected Wallet
            </ThemedText>
            <ThemedText
              style={[styles.connectionLine, { color: textSecondary }]}
            >
              Address: {shortAddress}
            </ThemedText>
            <ThemedText
              style={[styles.connectionLine, { color: textSecondary }]}
            >
              Chain: {chain?.name ?? "Unknown"}
            </ThemedText>
          </View>
        ) : (
          <ThemedText
            style={[styles.disconnectedHint, { color: textSecondary }]}
          >
            No wallet connected.
          </ThemedText>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
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
    marginTop: 16,
    fontSize: 13,
    fontWeight: "500",
  },
});
