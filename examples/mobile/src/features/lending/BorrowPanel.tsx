import { useEffect } from "react";
import { Card, Text, Button, TextField, Select, Toggle } from "@/ui";
import { useTheme } from "@/theme";
import { useSettingsStore, useSponsoredAvailable } from "@/core/settings";
import {
  useLendingStore,
  marketId,
  formatUsd18,
} from "@/features/lending/store";

export function BorrowPanel() {
  const sponsoredAvailable = useSponsoredAvailable();
  const { sponsored, setSponsored } = useSettingsStore();
  const { colors } = useTheme();
  const {
    markets,
    loadingMarkets,
    positions,
    collateralId,
    debtId,
    collateralAmount,
    borrowAmount,
    health,
    borrowSubmitting,
    borrowDryRunning,
    borrowDryRunResult,
    busyPosition,
    setCollateral,
    setDebt,
    setCollateralAmount,
    setBorrowAmount,
    refreshHealth,
    borrow,
    borrowDryRun,
    repayPosition,
  } = useLendingStore();

  useEffect(() => {
    void refreshHealth();
  }, [collateralId, debtId, refreshHealth]);

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

  const toOption = (m: (typeof markets)[number]) => ({
    // Include the pool name so the same asset across pools is distinguishable.
    label: m.poolName ? `${m.asset.symbol} · ${m.poolName}` : m.asset.symbol,
    value: marketId(m),
    ...(m.asset.metadata?.logoUrl
      ? { image: m.asset.metadata.logoUrl.href }
      : {}),
  });
  const collateral = markets.find((m) => marketId(m) === collateralId);
  const collateralOptions = markets.map(toOption);
  // Debt must share the collateral's pool and be borrowable.
  const debtOptions = markets
    .filter(
      (m) =>
        collateral &&
        m.poolAddress === collateral.poolAddress &&
        m.canBeBorrowed &&
        m.asset.address !== collateral.asset.address
    )
    .map(toOption);
  const borrowPositions = positions.filter((p) => p.type === "borrow");

  return (
    <>
      <Card>
        <Text variant="label">Collateral</Text>
        <Select
          title="Select collateral"
          options={collateralOptions}
          value={collateralId}
          onChange={setCollateral}
        />
        <TextField
          label="Collateral amount"
          placeholder="0.0"
          value={collateralAmount}
          onChangeText={setCollateralAmount}
          keyboardType="decimal-pad"
        />

        <Text variant="label">Borrow</Text>
        <Select
          title="Select debt token"
          options={debtOptions}
          value={debtId}
          onChange={setDebt}
        />
        <TextField
          label="Borrow amount"
          placeholder="0.0"
          value={borrowAmount}
          onChangeText={setBorrowAmount}
          keyboardType="decimal-pad"
        />

        {health ? (
          <Text variant="muted">
            Collateral {formatUsd18(health.collateralValue)} · Debt{" "}
            {formatUsd18(health.debtValue)}
          </Text>
        ) : null}

        {sponsoredAvailable ? (
          <Toggle
            label="Sponsored"
            value={sponsored}
            onValueChange={setSponsored}
          />
        ) : null}
        <Button
          title="Borrow"
          loading={borrowSubmitting}
          disabled={!collateralAmount.trim() || !borrowAmount.trim() || !debtId}
          onPress={() => void borrow()}
        />
        <Button
          title="Dry run"
          variant="secondary"
          loading={borrowDryRunning}
          disabled={!collateralAmount.trim() || !borrowAmount.trim() || !debtId}
          onPress={() => void borrowDryRun()}
        />
        {borrowDryRunResult ? (
          <Text
            style={{
              color: borrowDryRunResult.ok ? colors.success : colors.danger,
            }}
          >
            {borrowDryRunResult.message}
          </Text>
        ) : null}
      </Card>

      {borrowPositions.length > 0 ? (
        <Text variant="title">Your loans</Text>
      ) : null}
      {borrowPositions.map((p) => (
        <Card key={`${p.pool.id}:${p.debt?.token.address}`}>
          <Text variant="subtitle">
            {p.collateral.token.symbol} → {p.debt?.token.symbol ?? "—"}
          </Text>
          <Text variant="muted">
            Collateral {formatUsd18(p.collateral.usdValue)} · Debt{" "}
            {formatUsd18(p.debt?.usdValue)}
          </Text>
          {p.debt ? (
            <Button
              title="Repay all"
              variant="ghost"
              loading={busyPosition === p.pool.id}
              onPress={() => void repayPosition(p)}
            />
          ) : null}
        </Card>
      ))}
    </>
  );
}
