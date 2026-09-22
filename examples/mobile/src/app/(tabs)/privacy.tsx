import { useState } from "react";
import { Redirect } from "expo-router";
import { Screen, Card, Text, Segmented } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { usePrivacyStore } from "@/features/privacy/store";
import TongoPanel from "@/features/privacy/TongoPanel";
import Strk20Panel from "@/features/privacy/strk20/Strk20Panel";
import { useStrk20Store } from "@/features/privacy/strk20/store";
import { isExpoGo, PRIVACY_OHTTP } from "@/core/config";

type Protocol = "strk20" | "tongo";

// STRK20 sends the viewing key to the prover and discovery service, so it runs
// them over OHTTP — which needs `crypto.subtle`, which Hermes lacks. The
// polyfill for it (react-native-quick-crypto) is a native module absent from
// Expo Go. Turning OHTTP off would let the tab load here, but it would leak the
// client IP to those services, so the tab is gated instead of quietly downgraded.
// Tongo has no such dependency and still works.
function Strk20DevBuildRequired() {
  return (
    <Card>
      <Text variant="subtitle">Dev build required</Text>
      <Text variant="muted">
        STRK20 hides your IP from the prover and discovery service using OHTTP,
        which needs native crypto not available in Expo Go. Run a dev build:
        {"\n"}npx expo run:ios · npx expo run:android
      </Text>
    </Card>
  );
}

export default function PrivacyTab() {
  const wallet = useWalletStore((s) => s.wallet);
  const [protocol, setProtocol] = useState<Protocol>("strk20");

  // Each protocol keeps its own client and refresh, so pull-to-refresh has to
  // follow the visible tab.
  const refreshStrk20 = useStrk20Store((s) => s.refresh);
  const refreshTongo = usePrivacyStore((s) => s.refresh);

  if (!wallet) return <Redirect href="/" />;

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() =>
        void (protocol === "strk20" ? refreshStrk20() : refreshTongo())
      }
      refreshing={false}
    >
      <Card>
        <Text variant="label">Protocol</Text>
        <Segmented
          options={[
            { label: "STRK20", value: "strk20" },
            { label: "Tongo", value: "tongo" },
          ]}
          value={protocol}
          onChange={setProtocol}
        />
      </Card>

      {protocol !== "strk20" ? (
        <TongoPanel />
      ) : isExpoGo && PRIVACY_OHTTP ? (
        <Strk20DevBuildRequired />
      ) : (
        <Strk20Panel />
      )}
    </Screen>
  );
}
