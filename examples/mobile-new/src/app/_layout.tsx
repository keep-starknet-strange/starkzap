import "@/polyfills";

import { type ReactNode, useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { isExpoGo } from "@/core/config";
import { getDevLogin } from "@/core/dev-login";
import { useWalletStore } from "@/core/wallet/store";
import { TxBanner } from "@/core/tx-banner/TxBanner";

// AppKit (Reown) pulls native modules missing from Expo Go, so it is loaded
// only in dev/custom builds. In Expo Go the app renders without it.
const AppKitHost: ((props: { children: ReactNode }) => ReactNode) | null =
  isExpoGo
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("../core/appkit") as typeof import("@/core/appkit")).AppKitHost;

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

  const content = (
    <>
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
    </>
  );

  return (
    <SafeAreaProvider>
      {AppKitHost ? <AppKitHost>{content}</AppKitHost> : content}
    </SafeAreaProvider>
  );
}
