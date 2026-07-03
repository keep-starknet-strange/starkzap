import { useEffect } from "react";
import { View, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAppKit, useAccount, useProvider } from "@reown/appkit-react-native";
import {
  ConnectedEthereumWallet,
  ConnectedSolanaWallet,
  ExternalChain,
  type Eip1193Provider,
  type SolanaProvider,
} from "starkzap-native";
import { Screen, Card, Text, Button, TextField, Select, Segmented } from "@/ui";
import { useTheme } from "@/theme";
import { useWalletStore } from "@/core/wallet/store";
import { useExternalWalletStore } from "@/core/external-wallet/store";
import { NETWORKS } from "@/core/network";
import { useBridgeStore, type ChainFilter } from "@/features/bridge/store";

const truncateHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export default function BridgeScreen() {
  const { colors, spacing } = useTheme();
  const { open } = useAppKit();
  const { address, allAccounts } = useAccount();
  const { provider, providerType } = useProvider();
  const networkIndex = useWalletStore((s) => s.networkIndex);
  const { eth, sol, setEth, setSol } = useExternalWalletStore();
  const {
    tokens,
    loadingTokens,
    chainFilter,
    direction,
    selectedTokenId,
    amount,
    balance,
    submitting,
    error,
    history,
    busyId,
    fetchTokens,
    fetchBalance,
    setChainFilter,
    setDirection,
    setToken,
    setAmount,
    bridge,
    loadHistory,
    checkStatus,
    completeWithdraw,
  } = useBridgeStore();

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Reconcile the active external wallet from AppKit into the SDK wrappers.
  useEffect(() => {
    const snChain = NETWORKS[networkIndex].chainId;
    const account = allAccounts?.find((a) => a.address === address);
    let cancelled = false;
    (async () => {
      if (!provider || !account) {
        setEth(null);
        setSol(null);
      } else if (providerType === "eip155") {
        const w = await ConnectedEthereumWallet.from(
          {
            chain: ExternalChain.ETHEREUM,
            provider: provider as Eip1193Provider,
            address: account.address,
            chainId: String(account.chainId),
          },
          snChain
        );
        if (!cancelled) {
          setEth(w);
          setSol(null);
        }
      } else if (providerType === "solana") {
        const w = await ConnectedSolanaWallet.from(
          {
            chain: ExternalChain.SOLANA,
            provider: provider as unknown as SolanaProvider,
            address: account.address,
            chainId: String(account.chainId),
          },
          snChain
        );
        if (!cancelled) {
          setSol(w);
          setEth(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    address,
    provider,
    providerType,
    allAccounts,
    networkIndex,
    setEth,
    setSol,
  ]);

  // Refresh the token list whenever the connected external wallet changes.
  useEffect(() => {
    void fetchTokens();
  }, [eth, sol, fetchTokens]);

  // Fetch the selected token's available balance for the chosen direction.
  useEffect(() => {
    void fetchBalance();
  }, [selectedTokenId, direction, eth, sol, fetchBalance]);

  const connected = !!eth || !!sol;
  const filters: ChainFilter[] =
    eth && sol
      ? ["external", "ethereum", "solana"]
      : eth
        ? ["ethereum"]
        : sol
          ? ["solana"]
          : [];
  const visibleTokens = tokens.filter((t) =>
    chainFilter === "ethereum"
      ? t.chain === ExternalChain.ETHEREUM
      : chainFilter === "solana"
        ? t.chain === ExternalChain.SOLANA
        : true
  );
  const selected = tokens.find((t) => t.id === selectedTokenId);

  return (
    <Screen
      scroll
      edges={["left", "right"]}
      onRefresh={() => {
        void fetchTokens();
        void loadHistory();
      }}
      refreshing={loadingTokens}
    >
      {!connected ? (
        <Card>
          <Text variant="subtitle">Connect an external wallet</Text>
          <Text variant="muted">
            Bridge assets between Starknet and Ethereum/Solana. Connect a source
            wallet to see available tokens.
          </Text>
          <Button title="Connect wallet" onPress={() => open()} />
        </Card>
      ) : (
        <>
          <Card>
            <Button
              title="Manage wallet"
              variant="secondary"
              onPress={() => open()}
            />
            {filters.length > 1 ? (
              <Segmented
                options={filters.map((f) => ({ label: f, value: f }))}
                value={chainFilter}
                onChange={(v) => setChainFilter(v as ChainFilter)}
              />
            ) : null}
            <Segmented
              options={[
                { label: "To Starknet", value: "to-starknet" },
                { label: "From Starknet", value: "from-starknet" },
              ]}
              value={direction}
              onChange={(v) => setDirection(v as typeof direction)}
            />

            <Text variant="label">Token</Text>
            {loadingTokens && visibleTokens.length === 0 ? (
              <Text variant="muted">Loading tokens…</Text>
            ) : (
              <Select
                title="Select a token"
                options={visibleTokens.map((t) => ({
                  label: `${t.symbol} · ${t.chain} [${t.protocol}]`,
                  value: t.id,
                }))}
                value={selectedTokenId}
                onChange={setToken}
              />
            )}

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
              title={direction === "to-starknet" ? "Deposit" : "Withdraw"}
              loading={submitting}
              disabled={!amount.trim() || !selected}
              onPress={() => void bridge()}
            />
            {error ? (
              <Text style={{ color: colors.danger }}>{error}</Text>
            ) : null}
          </Card>

          {history.length > 0 ? <Text variant="title">Transfers</Text> : null}
          {history.map((r) => (
            <Card key={r.id}>
              <Text variant="subtitle">
                {r.type === "deposit" ? "Deposit" : "Withdraw"} {r.amount}{" "}
                {r.tokenSymbol}
              </Text>
              <Text variant="muted">
                {r.lastStatus ?? "Submitted"}
                {r.depositState ? ` · ${r.depositState}` : ""}
                {r.withdrawalState ? ` · ${r.withdrawalState}` : ""}
              </Text>
              {r.snTxHash ? (
                <Pressable
                  onPress={() => Clipboard.setStringAsync(r.snTxHash!)}
                >
                  <Text variant="muted">
                    Starknet: {truncateHash(r.snTxHash)}
                  </Text>
                </Pressable>
              ) : null}
              {r.externalTxHash ? (
                <Pressable
                  onPress={() => Clipboard.setStringAsync(r.externalTxHash!)}
                >
                  <Text variant="muted">
                    External: {truncateHash(r.externalTxHash)}
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Check status"
                    variant="secondary"
                    loading={busyId === r.id}
                    onPress={() => void checkStatus(r.id)}
                  />
                </View>
                {r.type === "initiateWithdraw" &&
                r.withdrawalState === "READY_TO_CLAIM" ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Complete"
                      loading={busyId === r.id}
                      onPress={() => void completeWithdraw(r.id)}
                    />
                  </View>
                ) : null}
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
