import "@/polyfills";

import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { getDevLogin } from "@/core/dev-login";
import { useWalletStore } from "@/core/wallet/store";
import { TxBanner } from "@/core/tx-banner/TxBanner";

// If .env supplies a dev private key, connect automatically on startup.
function useDevAutoLogin() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const dev = getDevLogin();
    if (!dev || useWalletStore.getState().wallet) return;
    started.current = true;
    const { setNetworkIndex, connectPrivateKey } = useWalletStore.getState();
    setNetworkIndex(dev.networkIndex);
    void connectPrivateKey(dev.privateKey, dev.presetName, false);
  }, []);
}

export default function RootLayout() {
  const { colors } = useTheme();
  useDevAutoLogin();

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="account"
          options={{
            headerShown: true,
            headerBackButtonDisplayMode: "minimal",
            title: "Account",
          }}
        />
        <Stack.Screen
          name="picker"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: "fitToContents",
            sheetGrabberVisible: true,
            headerShown: true,
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.card },
          }}
        />
        <Stack.Screen
          name="privy"
          options={{
            headerShown: true,
            headerBackButtonDisplayMode: "minimal",
            title: "Sign in with Privy",
          }}
        />
      </Stack>
      <TxBanner />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
