import { useState } from "react";
import { Card, Text, Button, TextField, Select } from "@/ui";
import { useWalletStore } from "@/core/wallet/store";
import { useTokensStore } from "@/core/tokens/store";
import {
  blocksUntilProvable,
  unavailableReason,
  useStrk20Store,
} from "./store";

export default function Strk20Panel() {
  const networkIndex = useWalletStore((s) => s.networkIndex);
  const walletType = useWalletStore((s) => s.walletType);
  const tokens = useTokensStore((s) => s.tokens);

  const {
    client,
    connecting,
    busy,
    step,
    error,
    registered,
    balances,
    pendingDeposit,
    lastTxBlock,
    head,
    connect,
    register,
    approveDeposit,
    finishDeposit,
    transfer,
    withdraw,
    recipientReady,
  } = useStrk20Store();

  const [symbol, setSymbol] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [toReady, setToReady] = useState<boolean | null>(null);

  const reason = unavailableReason(networkIndex, walletType);
  const token = tokens.find((t) => t.symbol === symbol);
  const waiting = blocksUntilProvable({ lastTxBlock, head });
  // Actions are blocked while the chain catches up: a proof must read state
  // that is already ~10 blocks old.
  const blocked = busy || waiting > 0;

  if (reason) return <Text variant="muted">{reason}</Text>;

  if (!client) {
    return (
      <Card>
        <Text variant="subtitle">STRK20 privacy pool</Text>
        <Text variant="muted">
          One pool for every token. Your viewing key is derived from your
          signing key, so nothing extra is stored.
        </Text>
        <Button
          title="Connect"
          loading={connecting}
          onPress={() => void connect()}
        />
        {error ? <Text variant="muted">{error}</Text> : null}
      </Card>
    );
  }

  async function checkRecipient(value: string) {
    setSendTo(value);
    setToReady(
      token && value.trim() ? await recipientReady(value, token) : null
    );
  }

  return (
    <>
      <Card>
        <Text variant="label">Status</Text>
        <Text variant="muted">
          {registered === null
            ? "Checking registration…"
            : registered
              ? "Registered — ready to transact."
              : "Not registered yet. Depositing registers you automatically."}
        </Text>

        {waiting > 0 ? (
          <>
            <Text variant="label">
              Waiting {waiting} block{waiting === 1 ? "" : "s"}
            </Text>
            <Text variant="muted">
              A proof must read state that is already ~10 blocks old, so the
              next private transaction cannot be built yet.
            </Text>
          </>
        ) : null}

        {step ? <Text variant="muted">{step}</Text> : null}
        {error ? <Text variant="muted">{error}</Text> : null}

        {registered === false ? (
          <Button
            title="Register now"
            variant="secondary"
            loading={busy}
            disabled={blocked}
            onPress={() => void register()}
          />
        ) : null}
      </Card>

      <Card>
        <Text variant="label">Private balances</Text>
        {balances.length === 0 ? (
          <Text variant="muted">No tokens.</Text>
        ) : (
          balances.map((b) => (
            <Text key={b.token.address} variant="body">
              {b.token.symbol} · {b.amount.toFormatted(true)} · {b.notes} note
              {b.notes === 1 ? "" : "s"}
            </Text>
          ))
        )}
        <Text variant="muted">
          Every token the app tracks works in the same pool.
        </Text>
      </Card>

      <Card>
        <Text variant="label">Token</Text>
        <Select
          title="Select a token"
          options={tokens.map((t) => ({ label: t.symbol, value: t.symbol }))}
          value={symbol}
          onChange={setSymbol}
        />
      </Card>

      {token ? (
        <>
          <Card>
            <Text variant="label">Deposit</Text>
            {pendingDeposit ? (
              <>
                <Text variant="muted">
                  Approved {pendingDeposit.input} {pendingDeposit.token.symbol}.
                  {waiting > 0
                    ? " Waiting for it to become provable…"
                    : " Ready — press Deposit to prove and submit."}
                </Text>
                <Button
                  title="Deposit"
                  loading={busy}
                  disabled={blocked}
                  onPress={() => void finishDeposit()}
                />
              </>
            ) : (
              <>
                <TextField
                  label="Amount"
                  placeholder="0.0"
                  value={depositAmount}
                  onChangeText={setDepositAmount}
                  keyboardType="decimal-pad"
                />
                <Text variant="muted">
                  Sends an ERC20 approve first; the pool cannot pull funds
                  without it.
                </Text>
                <Button
                  title="Approve"
                  loading={busy}
                  disabled={blocked || !depositAmount.trim()}
                  onPress={() =>
                    void approveDeposit(token, depositAmount).then(() =>
                      setDepositAmount("")
                    )
                  }
                />
              </>
            )}
          </Card>

          <Card>
            <Text variant="label">Private send</Text>
            <TextField
              label="Amount"
              placeholder="0.0"
              value={sendAmount}
              onChangeText={setSendAmount}
              keyboardType="decimal-pad"
            />
            <TextField
              label="Recipient address"
              placeholder="0x…"
              value={sendTo}
              onChangeText={(v) => void checkRecipient(v)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {toReady === false ? (
              <Text variant="muted">
                That account has not registered a viewing key, so it cannot
                receive a private transfer yet.
              </Text>
            ) : null}
            <Button
              title="Send privately"
              loading={busy}
              disabled={blocked || !sendAmount.trim() || toReady !== true}
              onPress={() => void transfer(token, sendTo, sendAmount)}
            />
          </Card>

          <Card>
            <Text variant="label">Withdraw</Text>
            <TextField
              label="Amount"
              placeholder="0.0"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="decimal-pad"
            />
            <Text variant="muted">Withdraws to your own wallet address.</Text>
            <Button
              title="Withdraw"
              loading={busy}
              disabled={blocked || !withdrawAmount.trim()}
              onPress={() => void withdraw(token, withdrawAmount)}
            />
          </Card>
        </>
      ) : null}
    </>
  );
}
