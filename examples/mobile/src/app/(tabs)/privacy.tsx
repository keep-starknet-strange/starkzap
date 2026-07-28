import { useState } from "react";
import { Redirect } from "expo-router";
import { Screen, Card, Text, Segmented } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { usePrivacyStore } from "@/features/privacy/store";
import TongoPanel from "@/features/privacy/TongoPanel";
import Strk20Panel from "@/features/privacy/strk20/Strk20Panel";
import { useStrk20Store } from "@/features/privacy/strk20/store";

type Protocol = "strk20" | "tongo";

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

      {protocol === "strk20" ? <Strk20Panel /> : <TongoPanel />}
    </Screen>
  );
}
