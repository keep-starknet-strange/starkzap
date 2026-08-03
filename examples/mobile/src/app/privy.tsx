import { lazy, Suspense } from "react";
import { ActivityIndicator } from "react-native";
import { Screen } from "@/ui";
import { useTheme } from "@/theme";

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
  return (
    <Suspense fallback={<Fallback />}>
      <PrivyScreen />
    </Suspense>
  );
}
