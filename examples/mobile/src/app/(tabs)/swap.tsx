import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Screen, Segmented } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { useBalancesStore } from "@/features/balances/store";
import { useSwapStore } from "@/features/swap/store";
import { useDcaStore } from "@/features/dca/store";
import { SwapPanel } from "@/features/swap/SwapPanel";
import { DcaPanel } from "@/features/dca/DcaPanel";

type Mode = "swap" | "dca";

export default function SwapTab() {
  const wallet = useWalletStore((s) => s.wallet);
  const { loading, refresh } = useBalancesStore();
  const fetchQuote = useSwapStore((s) => s.fetchQuote);
  const loadOrders = useDcaStore((s) => s.loadOrders);
  const [mode, setMode] = useState<Mode>("swap");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!wallet) return <Redirect href="/" />;

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => {
        void refresh();
        if (mode === "dca") void loadOrders();
        else void fetchQuote();
      }}
      refreshing={loading}
    >
      <Segmented
        options={[
          { label: "Swap", value: "swap" },
          { label: "DCA", value: "dca" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
      />
      {mode === "swap" ? <SwapPanel /> : <DcaPanel />}
    </Screen>
  );
}
