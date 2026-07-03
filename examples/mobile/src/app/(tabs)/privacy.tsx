import { useState } from "react";
import { Pressable } from "react-native";
import { Redirect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Amount } from "starkzap-native";
import { Screen, Card, Text, Button, TextField, Select } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { usePrivacyStore } from "@/features/privacy/store";
import { PRIVACY_PROVIDERS } from "@/features/privacy/providers";

export default function PrivacyTab() {
  const wallet = useWalletStore((s) => s.wallet);
  const networkIndex = useWalletStore((s) => s.networkIndex);
  const {
    make,
    providerId,
    tokenSymbol,
    instance,
    token,
    connecting,
    busy,
    address,
    balance,
    pending,
    setToken,
    connect,
    refresh,
    fund,
    withdraw,
    transfer,
    rollover,
  } = usePrivacyStore();

  const [fundAmount, setFundAmount] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [wTo, setWTo] = useState("");
  const [tAmount, setTAmount] = useState("");
  const [tx, setTx] = useState("");
  const [ty, setTy] = useState("");

  if (!wallet) return <Redirect href="/" />;

  const def = PRIVACY_PROVIDERS.find((p) => p.id === providerId);
  const tokenOptions = (def?.tokensForNetwork(networkIndex) ?? []).map((t) => ({
    label: t.symbol,
    value: t.symbol,
  }));
  const fmt = (v: bigint) =>
    token
      ? Amount.fromRaw(v, token.decimals, token.symbol).toFormatted(true)
      : "—";

  if (!make) {
    return (
      <Screen edges={["left", "right"]}>
        <Card>
          <Text variant="subtitle">Private-key login required</Text>
          <Text variant="muted">
            Confidential balances are derived from your key, so this feature is
            available only when you sign in with a private key.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => void refresh()}
      refreshing={false}
    >
      <Card>
        <Text variant="label">Provider · {def?.label ?? providerId}</Text>
        <Text variant="label">Token</Text>
        <Select
          title="Select a token"
          options={tokenOptions}
          value={tokenSymbol}
          onChange={setToken}
        />
        <Button
          title={instance ? "Reconnect" : "Connect"}
          loading={connecting}
          disabled={!tokenSymbol}
          onPress={() => void connect()}
        />
      </Card>

      {instance ? (
        <>
          <Card>
            <Text variant="label">Confidential balance</Text>
            <Text variant="subtitle">{fmt(balance)}</Text>
            {pending > 0n ? (
              <>
                <Text variant="muted">Pending: {fmt(pending)}</Text>
                <Button
                  title="Rollover pending"
                  variant="secondary"
                  loading={busy}
                  onPress={() => void rollover()}
                />
              </>
            ) : null}
            <Pressable onPress={() => Clipboard.setStringAsync(address)}>
              <Text variant="muted">Your address (tap to copy)</Text>
              <Text variant="body">
                {address.slice(0, 10)}…{address.slice(-6)}
              </Text>
            </Pressable>
          </Card>

          <Card>
            <Text variant="label">Shield (deposit)</Text>
            <TextField
              label="Amount"
              placeholder="0.0"
              value={fundAmount}
              onChangeText={setFundAmount}
              keyboardType="decimal-pad"
            />
            <Button
              title="Shield"
              loading={busy}
              disabled={!fundAmount.trim()}
              onPress={() =>
                void fund(fundAmount).then(() => setFundAmount(""))
              }
            />
          </Card>

          <Card>
            <Text variant="label">Unshield (withdraw)</Text>
            <TextField
              label="Amount"
              placeholder="0.0"
              value={wAmount}
              onChangeText={setWAmount}
              keyboardType="decimal-pad"
            />
            <TextField
              label="To address"
              placeholder="0x…"
              value={wTo}
              onChangeText={setWTo}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Unshield"
              loading={busy}
              disabled={!wAmount.trim() || !wTo.trim()}
              onPress={() => void withdraw(wAmount, wTo)}
            />
          </Card>

          <Card>
            <Text variant="label">Private transfer</Text>
            <TextField
              label="Amount"
              placeholder="0.0"
              value={tAmount}
              onChangeText={setTAmount}
              keyboardType="decimal-pad"
            />
            <TextField
              label="Recipient x"
              placeholder="0x…"
              value={tx}
              onChangeText={setTx}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextField
              label="Recipient y"
              placeholder="0x…"
              value={ty}
              onChangeText={setTy}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Send privately"
              loading={busy}
              disabled={!tAmount.trim() || !tx.trim() || !ty.trim()}
              onPress={() => void transfer(tAmount, tx, ty)}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
