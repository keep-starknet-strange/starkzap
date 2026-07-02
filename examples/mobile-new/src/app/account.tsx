import { useState } from "react";
import { View, Pressable } from "react-native";
import { Redirect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Screen, Text, Button, Card } from "@/ui";
import { useTheme } from "@/theme";
import { NETWORKS } from "@/core/network";
import { LOGIN_LABEL, useWalletStore } from "@/core/wallet/store";

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text variant="label">{label}</Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

export default function Account() {
  const { colors, spacing } = useTheme();
  const {
    wallet,
    address,
    walletType,
    networkIndex,
    isDeployed,
    connecting,
    error,
    checkDeployment,
    deploy,
    disconnect,
  } = useWalletStore();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await checkDeployment();
    } finally {
      setRefreshing(false);
    }
  };

  if (!wallet || !address) return <Redirect href="/" />;

  const status =
    isDeployed == null ? "Unknown" : isDeployed ? "Deployed" : "Not deployed";
  const statusColor =
    isDeployed === true
      ? colors.success
      : isDeployed === false
        ? colors.danger
        : colors.textMuted;

  return (
    <Screen
      scroll
      edges={["left", "right", "bottom"]}
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      <Card>
        <View style={{ gap: spacing.xs }}>
          <Text variant="label">Address</Text>
          <Pressable onPress={() => Clipboard.setStringAsync(address)}>
            <Text variant="subtitle">{truncate(address)}</Text>
            <Text variant="muted">Tap to copy</Text>
          </Pressable>
        </View>

        <Row label="Network" value={NETWORKS[networkIndex].name} />
        <Row label="Login" value={walletType ? LOGIN_LABEL[walletType] : "-"} />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="label">Status</Text>
          <Text style={{ color: statusColor, fontWeight: "600" }}>
            {status}
          </Text>
        </View>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </Card>

      {isDeployed === false && (
        <Button title="Deploy account" onPress={deploy} loading={connecting} />
      )}
      <Button title="Disconnect" variant="ghost" onPress={disconnect} />
    </Screen>
  );
}
