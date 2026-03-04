import "@walletconnect/react-native-compat";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { AppKit, AppKitProvider } from "@reown/appkit-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppToast } from "@/components/Toast";
import { PrivyWrapper } from "@/providers/privy";
import { appKit } from "@/providers/appkit";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <PrivyWrapper>
      <SafeAreaProvider>
        <AppKitProvider instance={appKit}>
          <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
          >
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="logs"
                options={{
                  presentation: "modal",
                  headerShown: false,
                }}
              />
            </Stack>
            <AppToast />
            <AppKit />
            <StatusBar style="auto" />
          </ThemeProvider>
        </AppKitProvider>
      </SafeAreaProvider>
    </PrivyWrapper>
  );
}
