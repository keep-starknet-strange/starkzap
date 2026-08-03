import { useEffect, useState } from "react";
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
import { getDevLogin } from "@/core/dev-login";
import {
  ACCOUNT_PRESETS,
  getSessionHint,
  useWalletStore,
} from "@/core/wallet/store";

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
  const [resumePrivy, setResumePrivy] = useState(false);

  // Resume the last login: Privy has a persisted session (route in to reconnect),
  // private key auto-logins only from the env dev key, otherwise re-opens its
  // form with the remembered preset. Cartridge isn't resumed here — its RN
  // adapter has no persisted session (see store).
  useEffect(() => {
    void getSessionHint().then((hint) => {
      if (!hint || useWalletStore.getState().wallet) return;
      // Return the user to the network they last used.
      if (hint.networkIndex != null) setNetworkIndex(hint.networkIndex);
      if (hint.walletType === "privatekey") {
        // Preselect the form so a missing/mismatched env key lands the user here.
        setShowKeyForm(true);
        if (hint.presetName) setPresetName(hint.presetName);
        const dev = getDevLogin();
        if (dev) {
          setNetworkIndex(dev.networkIndex); // env network wins for the dev key
          void connectPrivateKey(
            dev.privateKey,
            hint.presetName ?? dev.presetName,
            false,
            hint.address
          );
        }
      } else if (hint.walletType === "privy" && !isExpoGo && PRIVY_APP_ID) {
        setResumePrivy(true);
      }
    });
  }, [connectPrivateKey, setNetworkIndex]);

  if (wallet) return <Redirect href="/balances" />;
  if (resumePrivy) return <Redirect href="/privy" />;

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
