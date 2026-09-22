import { useEffect } from "react";
import { Redirect } from "expo-router";
import { Screen } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { useBalancesStore } from "@/features/balances/store";
import { BalancesCard } from "@/features/balances/BalancesCard";

export default function BalancesTab() {
  const wallet = useWalletStore((s) => s.wallet);
  const { loading, refresh } = useBalancesStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!wallet) return <Redirect href="/" />;

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => void refresh()}
      refreshing={loading}
    >
      <BalancesCard />
    </Screen>
  );
}
