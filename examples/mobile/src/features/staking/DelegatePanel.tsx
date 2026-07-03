import { useEffect } from "react";
import { View } from "react-native";
import { Card, Text, Button, TextField, Select } from "@/ui";
import { useTheme } from "@/theme";
import { useWalletStore } from "@/core/wallet/store";
import { useBalancesStore } from "@/features/balances/store";
import {
  useDelegateStore,
  validatorsForNetwork,
  type DelegatePosition,
} from "@/features/staking/store";

export function DelegatePanel() {
  const { colors, spacing } = useTheme();
  const networkIndex = useWalletStore((s) => s.networkIndex);
  const balances = useBalancesStore((s) => s.balances);
  const {
    validatorKey,
    pools,
    loadingPools,
    poolContract,
    amount,
    submitting,
    dryRunning,
    dryRunResult,
    positions,
    busyPool,
    selectValidator,
    setPool,
    setAmount,
    stake,
    dryRun,
  } = useDelegateStore();

  useEffect(() => {
    void useDelegateStore.getState().refresh();
  }, []);

  const validators = validatorsForNetwork(networkIndex);
  const validatorOptions = Object.entries(validators).map(([key, v]) => ({
    label: v.name,
    value: key,
    ...(v.logoUrl ? { image: v.logoUrl.href } : {}),
  }));
  const poolOptions = pools.map((p) => ({
    label: p.token.symbol,
    value: p.poolContract,
    ...(p.token.metadata?.logoUrl
      ? { image: p.token.metadata.logoUrl.href }
      : {}),
  }));
  const selectedPool = pools.find((p) => p.poolContract === poolContract);
  const balance = selectedPool
    ? balances.find((b) => b.token.address === selectedPool.token.address)
        ?.amount
    : undefined;

  return (
    <>
      <Card>
        <Text variant="label">Validator</Text>
        <Select
          title="Select a validator"
          options={validatorOptions}
          value={validatorKey}
          onChange={(v) => void selectValidator(v)}
        />

        {validatorKey ? (
          loadingPools ? (
            <Text variant="muted">Loading pools…</Text>
          ) : pools.length ? (
            <>
              <Text variant="label">Token</Text>
              <Select
                title="Select a token"
                options={poolOptions}
                value={poolContract}
                onChange={setPool}
              />
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
                title="Stake"
                loading={submitting}
                disabled={!amount.trim()}
                onPress={() => void stake()}
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
            </>
          ) : (
            <Text variant="muted">No pools for this validator.</Text>
          )
        ) : null}
      </Card>

      {positions.length > 0 ? (
        <Text variant="title">Your positions</Text>
      ) : null}
      {positions.map((p) => (
        <PositionCard
          key={p.pool.poolContract}
          position={p}
          busy={busyPool === p.pool.poolContract}
          gap={spacing.sm}
        />
      ))}
    </>
  );
}

function PositionCard({
  position,
  busy,
  gap,
}: {
  position: DelegatePosition;
  busy: boolean;
  gap: number;
}) {
  const { claim, exitIntent, exit } = useDelegateStore();
  const { validator, pool, member } = position;

  const hasRewards = !!member && member.rewards.toBase() > 0n;
  const hasStake = !!member && member.staked.toBase() > 0n;
  const unpooling = !!member && member.unpooling.toBase() > 0n;

  return (
    <Card>
      <Text variant="subtitle">
        {validator.name} · {pool.token.symbol}
      </Text>
      <Text variant="muted">
        Staked: {member ? member.staked.toFormatted(true) : "—"}
      </Text>
      <Text variant="muted">
        Rewards: {member ? member.rewards.toFormatted(true) : "—"}
      </Text>
      {unpooling ? (
        <Text variant="muted">
          Unpooling: {member!.unpooling.toFormatted(true)}
          {member!.unpoolTime
            ? ` · ready ${member!.unpoolTime.toLocaleDateString()}`
            : ""}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap }}>
        {hasRewards ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Claim"
              variant="secondary"
              loading={busy}
              onPress={() => void claim(position)}
            />
          </View>
        ) : null}
        {hasStake ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Exit intent"
              variant="ghost"
              loading={busy}
              onPress={() => void exitIntent(position)}
            />
          </View>
        ) : null}
        {unpooling ? (
          <View style={{ flex: 1 }}>
            <Button
              title="Exit"
              variant="ghost"
              loading={busy}
              onPress={() => void exit(position)}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
