import { lazy, Suspense } from "react";
import { Redirect } from "expo-router";
import { Screen, Card, Text } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { isExpoGo } from "@/core/config";

// The bridge screen pulls in AppKit (native modules) — load it only in dev
// builds so Expo Go never evaluates it.
const BridgeScreen = isExpoGo
  ? null
  : lazy(() => import("@/features/bridge/BridgeScreen"));

export default function BridgeTab() {
  const wallet = useWalletStore((s) => s.wallet);
  if (!wallet) return <Redirect href="/" />;

  if (!BridgeScreen) {
    return (
      <Screen edges={["left", "right"]}>
        <Card>
          <Text variant="subtitle">Dev build required</Text>
          <Text variant="muted">
            Bridging connects external wallets via Reown, which needs native
            modules not available in Expo Go. Run a dev build:
            {"\n"}npx expo run:ios · npx expo run:android
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Suspense
      fallback={
        <Screen edges={["left", "right"]}>
          <Text variant="muted">Loading…</Text>
        </Screen>
      }
    >
      <BridgeScreen />
    </Suspense>
  );
}
