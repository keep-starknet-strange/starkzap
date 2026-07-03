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
import { useSwapStore } from "@/features/swap/store";

export function SwapPanel() {
  const { colors, spacing } = useTheme();
  const tokens = useTokensStore((s) => s.tokens);
  const { balances, refresh } = useBalancesStore();
  const {
    tokenIn,
    tokenOut,
    amountIn,
    quote,
    quoting,
    submitting,
    error,
    providerId,
    dryRunning,
    dryRunResult,
    init,
    setTokenIn,
    setTokenOut,
    setAmountIn,
    setProvider,
    flip,
    fetchQuote,
    dryRun,
    swap,
  } = useSwapStore();

  useEffect(() => {
    if (tokens[0] && tokens[1]) init(tokens[0].address, tokens[1].address);
  }, [tokens, init]);

  useEffect(() => {
    const t = setTimeout(() => void fetchQuote(), 400);
    return () => clearTimeout(t);
  }, [tokenIn, tokenOut, amountIn, fetchQuote]);

  const options = tokens.map((t) => ({ label: t.symbol, value: t.address }));
  const outTok = tokens.find((t) => t.address === tokenOut);
  const inBalance = balances.find((b) => b.token.address === tokenIn)?.amount;
  const estOut =
    quote && outTok
      ? Amount.fromRaw(quote.amountOutBase, outTok).toFormatted(true)
      : "—";

  const onSwap = async () => {
    const ok = await swap();
    if (ok) {
      setAmountIn("");
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
          value={tokenIn}
          onChange={setTokenIn}
        />
        <TextField
          label="Amount"
          placeholder="0.0"
          value={amountIn}
          onChangeText={setAmountIn}
          keyboardType="decimal-pad"
        />
        <Text variant="muted">
          Balance: {inBalance ? inBalance.toFormatted(true) : "—"}
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
          value={tokenOut}
          onChange={setTokenOut}
        />
        <Text variant="body">{quoting ? "Quoting…" : `≈ ${estOut}`}</Text>
        {quote?.priceImpactBps != null ? (
          <Text variant="muted">
            Price impact: {(Number(quote.priceImpactBps) / 100).toFixed(2)}%
            {quote.provider ? ` • ${quote.provider}` : ""}
          </Text>
        ) : null}
      </Card>

      <Button
        title="Swap"
        loading={submitting}
        disabled={!quote || quoting}
        onPress={onSwap}
      />
      <Button
        title="Dry run"
        variant="secondary"
        loading={dryRunning}
        disabled={!amountIn.trim()}
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

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </>
  );
}
