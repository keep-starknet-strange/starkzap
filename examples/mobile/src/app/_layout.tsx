import "@/polyfills";

// Pulls the privacy SDK into the main bundle. starkzap core reaches it through a
// lazy `import()` so that consumers who skip the feature never resolve it — but
// Metro's dev server turns that `import()` into a separate chunk with its own
// module ID space, and on native the ids it registers do not match the ones the
// main bundle asks for. `loadPrivacySdk` then fails with `Requiring unknown
// module "…"`. Importing it statically here means there is no chunk to load and
// the async require resolves from the main registry instead.
//
// Only the dev server splits: `expo export` inlines everything, dev build or not,
// which is why the CI bundle step never saw this. Same reason as `@/polyfills`
// above — an app has to name a module for it to be in Metro's graph at all.
import "@starkware-libs/starknet-privacy-sdk";

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
