import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Screen, Segmented } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { useBalancesStore } from "@/features/balances/store";
import { useDelegateStore } from "@/features/staking/store";
import { useLstStore } from "@/features/staking/lst-store";
import { DelegatePanel } from "@/features/staking/DelegatePanel";
import { LstPanel } from "@/features/staking/LstPanel";

type Mode = "delegate" | "liquid";

export default function StakingTab() {
  const wallet = useWalletStore((s) => s.wallet);
  const { loading, refresh } = useBalancesStore();
  const delegateRefresh = useDelegateStore((s) => s.refresh);
  const lstRefresh = useLstStore((s) => s.refresh);
  const [mode, setMode] = useState<Mode>("delegate");

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
        if (mode === "delegate") void delegateRefresh();
        else void lstRefresh();
      }}
      refreshing={loading}
    >
      <Segmented
        options={[
          { label: "Delegate", value: "delegate" },
          { label: "Liquid", value: "liquid" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
      />
      {mode === "delegate" ? <DelegatePanel /> : <LstPanel />}
    </Screen>
  );
}
