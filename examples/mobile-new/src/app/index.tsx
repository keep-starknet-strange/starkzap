import { useState } from "react";
import { View, Pressable, Alert } from "react-native";
import { Redirect, router } from "expo-router";
import { stark } from "starknet";
import { Screen, Text, Button, Card, Segmented, TextField } from "@/ui";
import { useTheme } from "@/theme";
import { NETWORKS } from "@/core/network";
import {
  PRIVY_SERVER_URL,
  PAYMASTER_PROXY_URL,
  PRIVY_APP_ID,
  isExpoGo,
} from "@/core/config";
import { resolveExamplePaymasterNodeUrl } from "@/core/paymaster";
import { ACCOUNT_PRESETS, useWalletStore } from "@/core/wallet/store";

const PRESET_OPTIONS = [
  { label: "Ready", value: "Ready" },
  { label: "OZ", value: "OpenZeppelin" },
  { label: "Braavos", value: "Braavos" },
  { label: "Devnet", value: "Devnet" },
] satisfies { label: string; value: keyof typeof ACCOUNT_PRESETS }[];

export default function Login() {
  const { colors, spacing } = useTheme();
  const {
    wallet,
    networkIndex,
    setNetworkIndex,
    connecting,
    error,
    connectCartridge,
    connectPrivateKey,
  } = useWalletStore();

  const [showKeyForm, setShowKeyForm] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [presetName, setPresetName] = useState("Ready");
  const [sponsored, setSponsored] = useState(false);

  if (wallet) return <Redirect href="/home" />;

  const openPrivy = () => {
    if (isExpoGo) {
      Alert.alert(
        "Native build required",
        "Privy login uses native modules that aren't available in Expo Go.\n\nRun a dev build first:\n  npx expo run:ios\n  npx expo run:android"
      );
      return;
    }
    if (!PRIVY_APP_ID) {
      Alert.alert(
        "Privy not configured",
        "Set EXPO_PUBLIC_PRIVY_APP_ID (and EXPO_PUBLIC_PRIVY_SERVER_URL) in .env."
      );
      return;
    }
    router.push("/privy");
  };

  const net = NETWORKS[networkIndex];
  const paymasterAvailable = !!resolveExamplePaymasterNodeUrl({
    explicitProxyUrl: PAYMASTER_PROXY_URL,
    privyServerUrl: PRIVY_SERVER_URL,
    chainId: net.chainId.toLiteral(),
  });

  return (
    <Screen scroll>
      <View style={{ alignItems: "flex-start", gap: spacing.xs }}>
        <Text variant="title">Starkzap</Text>
        <Text variant="muted">React Native SDK example</Text>
      </View>

      <Card>
        <Text variant="label">Network</Text>
        <Segmented
          options={NETWORKS.map((n, i) => ({
            label: n.name,
            value: String(i),
          }))}
          value={String(networkIndex)}
          onChange={(v) => setNetworkIndex(Number(v))}
        />

        <Button
          title="Sign in with Cartridge"
          onPress={connectCartridge}
          loading={connecting}
        />

        <Button
          title="Sign in with Privy"
          variant="secondary"
          onPress={openPrivy}
        />

        <Pressable
          onPress={() => setShowKeyForm((v) => !v)}
          style={{ alignItems: "center", paddingVertical: spacing.xs }}
        >
          <Text variant="muted">
            {showKeyForm ? "Hide private key" : "Use a private key"}
          </Text>
        </Pressable>

        {showKeyForm && (
          <View style={{ gap: spacing.md }}>
            <TextField
              label="Private key"
              placeholder="Paste or generate a key"
              value={privateKey}
              onChangeText={setPrivateKey}
              autoCapitalize="none"
              autoCorrect={false}
              right={
                <Pressable
                  onPress={() => setPrivateKey(stark.randomAddress())}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: "600" }}>
                    Generate
                  </Text>
                </Pressable>
              }
            />

            <View style={{ gap: spacing.sm }}>
              <Text variant="label">Account type</Text>
              <Segmented
                options={PRESET_OPTIONS}
                value={presetName}
                onChange={setPresetName}
              />
            </View>

            {paymasterAvailable && (
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Gas fees</Text>
                <Segmented
                  options={[
                    { label: "Sponsored", value: "sponsored" },
                    { label: "You pay", value: "self" },
                  ]}
                  value={sponsored ? "sponsored" : "self"}
                  onChange={(v) => setSponsored(v === "sponsored")}
                />
              </View>
            )}

            <Button
              title="Connect"
              variant="secondary"
              loading={connecting}
              disabled={!privateKey.trim()}
              onPress={() =>
                connectPrivateKey(privateKey, presetName, sponsored)
              }
            />
          </View>
        )}

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </Card>
    </Screen>
  );
}
