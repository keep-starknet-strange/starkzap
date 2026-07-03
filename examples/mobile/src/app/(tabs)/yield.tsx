import { useEffect } from "react";
import { Redirect } from "expo-router";
import { Screen, Card, Text, Button, TextField, Select } from "@/ui";
import { useTheme } from "@/theme";
import { useWalletStore } from "@/core/wallet/store";
import { useBalancesStore } from "@/features/balances/store";
import { useYieldStore, apyLabel } from "@/features/yield/store";

export default function YieldTab() {
  const { colors } = useTheme();
  const wallet = useWalletStore((s) => s.wallet);
  const balances = useBalancesStore((s) => s.balances);
  const {
    strategies,
    loadingStrategies,
    unsupported,
    strategyId,
    amount,
    submitting,
    dryRunning,
    dryRunResult,
    positions,
    busyStrategy,
    loadStrategies,
    refresh,
    setStrategy,
    setAmount,
    deposit,
    dryRun,
    withdrawAll,
  } = useYieldStore();

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  if (!wallet) return <Redirect href="/" />;

  const selected = strategies.find((s) => s.id === strategyId);
  const token = selected?.depositTokens[0];
  const balance = token
    ? balances.find((b) => b.token.address === token.address)?.amount
    : undefined;
  const tracked = Object.entries(positions).filter(([, p]) => p);

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => {
        void loadStrategies();
        void refresh();
      }}
      refreshing={loadingStrategies}
    >
      {unsupported ? (
        <Text variant="muted">
          Yield strategies (Troves) are only available on Mainnet.
        </Text>
      ) : strategies.length === 0 ? (
        <Text variant="muted">Loading strategies…</Text>
      ) : (
        <Card>
          <Text variant="label">Strategy</Text>
          <Select
            title="Select a strategy"
            options={strategies.map((s) => ({
              label: s.name,
              value: s.id,
              ...(s.depositTokens[0]?.logo
                ? { image: s.depositTokens[0].logo }
                : {}),
            }))}
            value={strategyId}
            onChange={setStrategy}
          />
          {selected ? (
            <Text variant="muted">
              {apyLabel(selected)} · deposit {token?.symbol}
            </Text>
          ) : null}
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
            title="Deposit"
            loading={submitting}
            disabled={!amount.trim()}
            onPress={() => void deposit()}
          />
          <Button
            title="Dry run"
            variant="secondary"
            loading={dryRunning}
            disabled={!amount.trim()}
            onPress={() => void dryRun()}
          />
          {dryRunResult ? (
            <Text
              style={{
                color: dryRunResult.ok ? colors.success : colors.danger,
              }}
            >
              {dryRunResult.message}
            </Text>
          ) : null}
        </Card>
      )}

      {tracked.length > 0 ? <Text variant="title">Your positions</Text> : null}
      {tracked.map(([id, p]) => {
        const s = strategies.find((x) => x.id === id);
        return (
          <Card key={id}>
            <Text variant="subtitle">{s?.name ?? id}</Text>
            <Text variant="muted">
              Value: {p!.amounts.map((a) => a.toFormatted(true)).join(" + ")}
            </Text>
            <Button
              title="Withdraw all"
              variant="ghost"
              loading={busyStrategy === id}
              onPress={() => void withdrawAll(id)}
            />
          </Card>
        );
      })}
    </Screen>
  );
}
