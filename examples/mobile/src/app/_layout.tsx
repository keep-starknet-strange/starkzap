import "@/polyfills";

import { lazy, Suspense, type ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { isExpoGo, PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/core/config";
import { TxBanner } from "@/core/tx-banner/TxBanner";

// AppKit (Reown) pulls native modules missing from Expo Go, so it is loaded
// only in dev/custom builds. In Expo Go the app renders without it.
const AppKitHost: ((props: { children: ReactNode }) => ReactNode) | null =
  isExpoGo
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("../core/appkit") as typeof import("@/core/appkit")).AppKitHost;

const PrivyProvider = isExpoGo
  ? null
  : lazy(() =>
      import("@privy-io/expo").then(({ PrivyProvider }) => ({
        default: PrivyProvider,
      }))
    );

export default function RootLayout() {
  const { colors } = useTheme();

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
  const appContent = AppKitHost ? <AppKitHost>{content}</AppKitHost> : content;

  return (
    <SafeAreaProvider>
      {PrivyProvider && PRIVY_APP_ID ? (
        <Suspense fallback={null}>
          <PrivyProvider
            appId={PRIVY_APP_ID}
            {...(PRIVY_CLIENT_ID ? { clientId: PRIVY_CLIENT_ID } : {})}
          >
            {appContent}
          </PrivyProvider>
        </Suspense>
      ) : (
        appContent
      )}
    </SafeAreaProvider>
  );
}
