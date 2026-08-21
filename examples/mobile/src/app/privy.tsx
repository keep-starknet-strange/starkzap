import { lazy, Suspense } from "react";
import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { Screen } from "@/ui";
import { useTheme } from "@/theme";
import { isExpoGo, PRIVY_APP_ID } from "@/core/config";

// Lazy so the Privy SDK (and its native modules) are only evaluated when this
// route is actually opened — never at startup, keeping Expo Go safe.
const PrivyScreen = lazy(() => import("@/core/privy/PrivyScreen"));

function Fallback() {
  const { colors } = useTheme();
  return (
    <Screen center>
      <ActivityIndicator color={colors.accent} />
    </Screen>
  );
}

export default function PrivyRoute() {
  if (isExpoGo || !PRIVY_APP_ID) return <Redirect href="/" />;

  return (
    <Suspense fallback={<Fallback />}>
      <PrivyScreen />
    </Suspense>
  );
}
