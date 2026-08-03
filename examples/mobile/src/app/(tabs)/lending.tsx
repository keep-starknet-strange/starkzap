import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Screen, Segmented } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { useLendingStore } from "@/features/lending/store";
import { EarnPanel } from "@/features/lending/EarnPanel";
import { BorrowPanel } from "@/features/lending/BorrowPanel";

type Mode = "earn" | "borrow";

export default function LendingTab() {
  const wallet = useWalletStore((s) => s.wallet);
  const { loadingMarkets, loadMarkets, refresh } = useLendingStore();
  const [mode, setMode] = useState<Mode>("earn");

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  if (!wallet) return <Redirect href="/" />;

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => {
        void loadMarkets();
        void refresh();
      }}
      refreshing={loadingMarkets}
    >
      <Segmented
        options={[
          { label: "Earn", value: "earn" },
          { label: "Borrow", value: "borrow" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
      />
      {mode === "earn" ? <EarnPanel /> : <BorrowPanel />}
    </Screen>
  );
}
