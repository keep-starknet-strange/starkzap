import { useState } from "react";
import { StyleSheet, View, Image } from "react-native";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";
import type { Token, Amount } from "starkzap";

interface TokenBalanceProps {
  token: Token;
  balance: Amount | null;
  isLoading?: boolean;
}

function TokenLogo({ token }: { token: Token }) {
  const [imageError, setImageError] = useState(false);

  if (!token.metadata?.logoUrl || imageError) {
    return (
      <View style={[styles.logo, styles.logoPlaceholder]}>
        <ThemedText style={styles.logoText}>
          {token.symbol.charAt(0).toUpperCase()}
        </ThemedText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: token.metadata.logoUrl.toString() }}
      style={styles.logo}
      onError={() => setImageError(true)}
    />
  );
}

export function TokenBalance({ token, balance, isLoading }: TokenBalanceProps) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.tokenInfo}>
        <TokenLogo token={token} />
        <View style={styles.tokenDetails}>
          <ThemedText style={styles.symbol}>{token.symbol}</ThemedText>
          <ThemedText style={styles.name}>{token.name}</ThemedText>
        </View>
      </View>
      <View style={styles.balanceContainer}>
        {isLoading ? (
          <ThemedText style={styles.loading}>Loading...</ThemedText>
        ) : balance ? (
          <ThemedText style={styles.balance}>
            {balance.toFormatted(true)}
          </ThemedText>
        ) : (
          <ThemedText style={styles.balance}>--</ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 12,
    marginBottom: 8,
  },
  tokenInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  logoPlaceholder: {
    backgroundColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  tokenDetails: {
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
  balanceContainer: {
    alignItems: "flex-end",
  },
  balance: {
    fontSize: 16,
    fontWeight: "500",
  },
  loading: {
    fontSize: 14,
    opacity: 0.5,
  },
});
