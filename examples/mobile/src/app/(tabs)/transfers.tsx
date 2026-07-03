import { useEffect } from "react";
import { View, Pressable } from "react-native";
import { Redirect } from "expo-router";
import {
  Screen,
  Card,
  Text,
  Button,
  TextField,
  Select,
  IconSymbol,
} from "@/ui";
import { useTheme } from "@/theme";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";
import { useBalancesStore } from "@/features/balances/store";
import { useTransfersStore } from "@/features/transfers/store";

export default function TransfersTab() {
  const { colors, spacing } = useTheme();
  const wallet = useWalletStore((s) => s.wallet);
  const tokens = useTokensStore((s) => s.tokens);
  const { balances, loading, refresh } = useBalancesStore();
  const { items, submitting, addItem, updateItem, removeItem, reset, send } =
    useTransfersStore();

  const firstToken = tokens[0]?.address ?? "";

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Always keep at least one row.
  useEffect(() => {
    if (items.length === 0) reset(firstToken);
  }, [items.length, firstToken, reset]);

  if (!wallet) return <Redirect href="/" />;

  const tokenOptions = tokens.map((t) => ({
    label: t.symbol,
    value: t.address,
  }));
  const balanceOf = (address: string) =>
    balances.find((b) => b.token.address === address)?.amount;
  const hasValid = items.some(
    (i) => i.tokenAddress && i.to.trim() && i.amount.trim()
  );

  const onSend = async () => {
    const ok = await send();
    if (ok) {
      reset(firstToken);
      void refresh();
    }
  };

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => void refresh()}
      refreshing={loading}
    >
      {items.map((item) => {
        const balance = balanceOf(item.tokenAddress);
        return (
          <Card key={item.id}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Select
                  title="Select a token"
                  options={tokenOptions}
                  value={item.tokenAddress}
                  onChange={(v) => updateItem(item.id, { tokenAddress: v })}
                />
              </View>
              {items.length > 1 ? (
                <Pressable
                  onPress={() => removeItem(item.id)}
                  hitSlop={8}
                  style={{
                    justifyContent: "center",
                    paddingHorizontal: spacing.xs,
                  }}
                >
                  <IconSymbol name="trash" size={22} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>

            <TextField
              label="Recipient"
              placeholder="0x…"
              value={item.to}
              onChangeText={(v) => updateItem(item.id, { to: v })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Amount"
              placeholder="0.0"
              value={item.amount}
              onChangeText={(v) => updateItem(item.id, { amount: v })}
              keyboardType="decimal-pad"
            />
            <Text variant="muted">
              Balance: {balance ? balance.toFormatted(true) : "—"}
            </Text>
          </Card>
        );
      })}

      <Button
        title="Add recipient"
        variant="secondary"
        onPress={() => addItem(firstToken)}
      />
      <Button
        title="Send"
        loading={submitting}
        disabled={!hasValid}
        onPress={onSend}
      />
    </Screen>
  );
}
