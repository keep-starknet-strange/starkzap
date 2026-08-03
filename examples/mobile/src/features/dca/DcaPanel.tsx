import { useEffect } from "react";
import { Pressable } from "react-native";
import { Amount } from "starkzap-native";
import {
  Card,
  Text,
  Button,
  TextField,
  Select,
  Segmented,
  IconSymbol,
} from "@/ui";
import { useTheme } from "@/theme";
import { useTokensStore } from "@/core/tokens/store";
import { PROVIDER_OPTIONS_LIST } from "@/core/wallet/store";
import { useBalancesStore } from "@/features/balances/store";
import { DCA_FREQUENCIES, useDcaStore } from "@/features/dca/store";

export function DcaPanel() {
  const { colors, spacing } = useTheme();
  const tokens = useTokensStore((s) => s.tokens);
  const { balances, refresh } = useBalancesStore();
  const {
    sellToken,
    buyToken,
    total,
    cycle,
    frequency,
    preview,
    previewing,
    submitting,
    error,
    dryRunning,
    dryRunResult,
    orders,
    cancellingId,
    providerId,
    init,
    setSellToken,
    setBuyToken,
    setTotal,
    setCycle,
    setFrequency,
    setProvider,
    flip,
    fetchPreview,
    dryRun,
    createOrder,
    loadOrders,
    cancel,
  } = useDcaStore();

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, providerId]);

  useEffect(() => {
    if (tokens[0] && tokens[1]) init(tokens[0].address, tokens[1].address);
  }, [tokens, init]);

  useEffect(() => {
    const t = setTimeout(() => void fetchPreview(), 400);
    return () => clearTimeout(t);
  }, [sellToken, buyToken, cycle, fetchPreview]);

  const options = tokens.map((t) => ({ label: t.symbol, value: t.address }));
  const symbolOf = (addr: string) =>
    tokens.find((t) => t.address === addr)?.symbol ?? `${addr.slice(0, 6)}…`;
  const amountFmt = (base: bigint, addr: string) => {
    const t = tokens.find((tok) => tok.address === addr);
    return t ? Amount.fromRaw(base, t).toFormatted(true) : String(base);
  };
  const freqLabel = (f: string) =>
    DCA_FREQUENCIES.find((o) => o.value === f)?.label ??
    (f === "CONTINUOUS" ? "Continuous" : f);

  const buyTok = tokens.find((t) => t.address === buyToken);
  const sellBalance = balances.find(
    (b) => b.token.address === sellToken
  )?.amount;
  const estPerCycle =
    preview && buyTok
      ? Amount.fromRaw(preview.amountOutBase, buyTok).toFormatted(true)
      : "—";

  const onCreate = async () => {
    const ok = await createOrder();
    if (ok) {
      setTotal("");
      setCycle("");
      void refresh();
    }
  };

  return (
    <>
      <Segmented
        options={PROVIDER_OPTIONS_LIST}
        value={providerId}
        onChange={setProvider}
      />
      <Card>
        <Text variant="label">You pay</Text>
        <Select
          title="Select a token"
          options={options}
          value={sellToken}
          onChange={setSellToken}
        />
        <TextField
          label="Total amount"
          placeholder="0.0"
          value={total}
          onChangeText={setTotal}
          keyboardType="decimal-pad"
        />
        <TextField
          label="Per cycle"
          placeholder="0.0"
          value={cycle}
          onChangeText={setCycle}
          keyboardType="decimal-pad"
        />
        <Text variant="muted">
          Balance: {sellBalance ? sellBalance.toFormatted(true) : "—"}
        </Text>

        <Pressable
          onPress={flip}
          hitSlop={8}
          style={{ alignSelf: "center", padding: spacing.xs }}
        >
          <IconSymbol
            name="arrow.left.arrow.right"
            size={22}
            color={colors.primary}
          />
        </Pressable>

        <Text variant="label">You receive</Text>
        <Select
          title="Select a token"
          options={options}
          value={buyToken}
          onChange={setBuyToken}
        />

        <Text variant="label">Frequency</Text>
        <Select
          title="Select a frequency"
          options={DCA_FREQUENCIES}
          value={frequency}
          onChange={setFrequency}
        />

        <Text variant="body">
          {previewing ? "Estimating…" : `≈ ${estPerCycle} per cycle`}
        </Text>

        <Button
          title="Create DCA order"
          loading={submitting}
          disabled={!total.trim() || !cycle.trim()}
          onPress={onCreate}
        />
        <Button
          title="Dry run"
          variant="secondary"
          loading={dryRunning}
          disabled={!total.trim() || !cycle.trim()}
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

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      {orders.length > 0 ? <Text variant="title">Active orders</Text> : null}
      {orders.map((order) => (
        <Card key={order.id}>
          <Text variant="subtitle">
            {symbolOf(order.sellTokenAddress)} →{" "}
            {symbolOf(order.buyTokenAddress)}
          </Text>
          <Text variant="muted">
            {amountFmt(
              order.sellAmountPerCycleBase ?? order.sellAmountBase,
              order.sellTokenAddress
            )}{" "}
            per cycle • {freqLabel(order.frequency)}
          </Text>
          <Text variant="muted">
            {order.executedTradesCount}/{order.iterations} cycles •{" "}
            {order.status}
          </Text>
          {order.status !== "CLOSED" ? (
            <Button
              title="Cancel"
              variant="ghost"
              loading={cancellingId === order.id}
              onPress={() => void cancel(order)}
            />
          ) : null}
        </Card>
      ))}
    </>
  );
}
