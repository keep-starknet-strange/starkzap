import { StyleSheet, View, Image } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

interface TokenItemProps {
  symbol: string;
  name: string;
  balance: string;
  logoUrl?: string;
  isLoading?: boolean;
}

export function TokenItem({
  symbol,
  name,
  balance,
  logoUrl,
  isLoading,
}: TokenItemProps) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.leftSection}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <ThemedText style={styles.logoPlaceholderText}>
              {symbol.slice(0, 2)}
            </ThemedText>
          </View>
        )}
        <View style={styles.tokenInfo}>
          <ThemedText style={styles.symbol}>{symbol}</ThemedText>
          <ThemedText style={styles.name} numberOfLines={1}>
            {name}
          </ThemedText>
        </View>
      </View>
      <View style={styles.rightSection}>
        {isLoading ? (
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        ) : (
          <ThemedText style={styles.balance}>{balance}</ThemedText>
        )}
      </View>
    </ThemedView>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(128, 128, 128, 0.2)",
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(128, 128, 128, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  logoPlaceholderText: {
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.7,
  },
  tokenInfo: {
    marginLeft: 12,
    flex: 1,
  },
  symbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  name: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  rightSection: {
    alignItems: "flex-end",
  },
  balance: {
    fontSize: 16,
    fontWeight: "500",
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.5,
  },
});
