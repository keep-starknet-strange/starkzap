import { useEffect, useState } from "react";
import { Card, Text, Button, TextField } from "@/ui";
import { useBalancesStore } from "@/features/balances/store";
import { useLstStore } from "@/features/staking/lst-store";

export function LstPanel() {
  const assets = useLstStore((s) => s.assets);

  useEffect(() => {
    void useLstStore.getState().load();
  }, []);

  if (assets.length === 0) {
    return (
      <Text variant="muted">
        Liquid staking is not available on this network.
      </Text>
    );
  }

  return (
    <>
      {assets.map((asset) => (
        <LstAssetCard key={asset} asset={asset} />
      ))}
    </>
  );
}

function LstAssetCard({ asset }: { asset: string }) {
  const balances = useBalancesStore((s) => s.balances);
  const member = useLstStore((s) => s.positions[asset]);
  const busy = useLstStore((s) => s.busyAsset === asset);
  const { enter, exit } = useLstStore();
  const [amount, setAmount] = useState("");

  const balance = balances.find((b) => b.token.symbol === asset)?.amount;
  const staked = member && member.staked.toBase() > 0n ? member.staked : null;

  const onStake = async () => {
    const ok = await enter(asset, amount);
    if (ok) setAmount("");
  };

  return (
    <Card>
      <Text variant="subtitle">Liquid stake {asset}</Text>
      <TextField
        label="Amount"
        placeholder="0.0"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Text variant="muted">
        Balance: {balance ? balance.toFormatted(true) : "—"}
      </Text>
      <Button
        title={`Stake ${asset}`}
        loading={busy}
        disabled={!amount.trim()}
        onPress={() => void onStake()}
      />

      {staked ? (
        <>
          <Text variant="muted">Staked: {staked.toFormatted(true)}</Text>
          <Button
            title="Exit"
            variant="ghost"
            loading={busy}
            onPress={() => void exit(asset)}
          />
        </>
      ) : null}
    </Card>
  );
}
