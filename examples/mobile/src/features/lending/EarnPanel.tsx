import { Card, Text, Button, TextField, Select } from "@/ui";
import { useTheme } from "@/theme";
import { useBalancesStore } from "@/features/balances/store";
import { Amount } from "starkzap-native";
import {
  useLendingStore,
  marketId,
  formatUsd18,
} from "@/features/lending/store";

export function EarnPanel() {
  const { colors } = useTheme();
  const balances = useBalancesStore((s) => s.balances);
  const {
    markets,
    loadingMarkets,
    positions,
    earnMarketId,
    earnAmount,
    earnSubmitting,
    earnDryRunning,
    earnDryRunResult,
    busyPosition,
    setEarnMarket,
    setEarnAmount,
    deposit,
    earnDryRun,
    withdrawPosition,
  } = useLendingStore();

  if (loadingMarkets && markets.length === 0) {
    return <Text variant="muted">Loading markets…</Text>;
  }
  if (markets.length === 0) {
    return (
      <Text variant="muted">
        No lending markets on this network (Vesu is mainnet).
      </Text>
    );
  }

  const options = markets.map((m) => ({
    label: m.poolName ? `${m.asset.symbol} · ${m.poolName}` : m.asset.symbol,
    value: marketId(m),
    ...(m.asset.metadata?.logoUrl
      ? { image: m.asset.metadata.logoUrl.href }
      : {}),
  }));
  const selected = markets.find((m) => marketId(m) === earnMarketId);
  const balance = selected
    ? balances.find((b) => b.token.address === selected.asset.address)?.amount
    : undefined;
  const earnPositions = positions.filter((p) => p.type === "earn");

  return (
    <>
      <Card>
        <Text variant="label">Market</Text>
        <Select
          title="Select a market"
          options={options}
          value={earnMarketId}
          onChange={setEarnMarket}
        />
        {selected?.stats?.supplyApy ? (
          <Text variant="muted">
            Supply APY: {selected.stats.supplyApy.toFormatted(true)}
          </Text>
        ) : null}
        <TextField
          label="Amount"
          placeholder="0.0"
          value={earnAmount}
          onChangeText={setEarnAmount}
          keyboardType="decimal-pad"
        />
        <Text variant="muted">
          Balance: {balance ? balance.toFormatted(true) : "—"}
        </Text>
        <Button
          title="Deposit"
          loading={earnSubmitting}
          disabled={!earnAmount.trim()}
          onPress={() => void deposit()}
        />
        <Button
          title="Dry run"
          variant="secondary"
          loading={earnDryRunning}
          disabled={!earnAmount.trim()}
          onPress={() => void earnDryRun()}
        />
        {earnDryRunResult ? (
          <Text
            style={{
              color: earnDryRunResult.ok ? colors.success : colors.danger,
            }}
          >
            {earnDryRunResult.message}
          </Text>
        ) : null}
      </Card>

      {earnPositions.length > 0 ? (
        <Text variant="title">Your deposits</Text>
      ) : null}
      {earnPositions.map((p) => (
        <Card key={p.pool.id}>
          <Text variant="subtitle">
            {p.collateral.token.symbol}
            {p.pool.name ? ` · ${p.pool.name}` : ""}
          </Text>
          <Text variant="muted">
            Supplied:{" "}
            {Amount.fromRaw(
              p.collateral.amount,
              p.collateral.token
            ).toFormatted(true)}{" "}
            · {formatUsd18(p.collateral.usdValue)}
          </Text>
          <Button
            title="Withdraw all"
            variant="ghost"
            loading={busyPosition === p.pool.id}
            onPress={() => void withdrawPosition(p)}
          />
        </Card>
      ))}
    </>
  );
}
