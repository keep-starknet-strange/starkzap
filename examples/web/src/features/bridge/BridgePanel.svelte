<script lang="ts">
  import { onMount } from "svelte";
  import { Amount, BridgeTransferStatus, WithdrawalState } from "starkzap";
  import type { StoredBridgeTx } from "../../../bridge/tx-storage";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import Toggle from "~/lib/ui/Toggle.svelte";
  import StatBox from "~/lib/ui/StatBox.svelte";
  import HashRow from "./HashRow.svelte";
  import { externalExplorer, starknetExplorer } from "./explorer";
  import { formatFeeEstimate } from "../../../bridge";
  import type { BridgeDirection } from "../../../bridge";
  import {
    enabled,
    bridgeState,
    history,
    ensureBridge,
    openAppKit,
    setDirection,
    selectToken,
    setFastTransfer,
    setAutoWithdraw,
    refresh,
    fetchFeeEstimate,
    deposit,
    initiateWithdraw,
    checkTxStatus,
    completeBridgeTx,
    removeTxRecord,
    clearCompletedTxRecords,
  } from "./store";

  let amount = $state("");
  let checkingId = $state<string | null>(null);
  onMount(ensureBridge);

  async function onCheck(id: string) {
    checkingId = id;
    try {
      await checkTxStatus(id);
    } finally {
      checkingId = null;
    }
  }

  const s = $derived($bridgeState);
  const tokenOptions = $derived([
    { label: "Select a token", value: "" },
    ...(s?.tokens.map((t) => ({
      label: `${t.symbol} · ${t.protocol}`,
      value: t.id,
    })) ?? []),
  ]);
  const ethWallet = $derived(s?.connectedEthWallet);
  const solWallet = $derived(s?.connectedSolWallet);
  const toStarknet = $derived(s?.direction === "to-starknet");

  const balanceRows = $derived(
    s
      ? [
          {
            label: "L2",
            value: s.starknetBalanceLoading ? "…" : (s.starknetBalance ?? "—"),
          },
          {
            label: "L1",
            // externalBalance is already formatted (number + symbol);
            // externalBalanceUnit is just the numeric part, so don't append it.
            value: s.externalBalanceLoading ? "…" : (s.externalBalance ?? "—"),
          },
        ]
      : []
  );

  // formatFeeEstimate emits "Label: value" lines — split them into rows.
  const feeRows = $derived(
    s?.feeEstimate
      ? formatFeeEstimate(s.feeEstimate)
          .split("\n")
          .map((line) => {
            const i = line.indexOf(": ");
            return i === -1
              ? { label: line, value: "" }
              : { label: line.slice(0, i), value: line.slice(i + 2) };
          })
      : []
  );

  const truncate = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
  const txAmount = (tx: StoredBridgeTx) =>
    Amount.fromRaw(BigInt(tx.amountRaw), tx.tokenDecimals, tx.tokenSymbol).toFormatted(true);

  const cap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  // Deposit: {chain} → Starknet.  Withdraw: Starknet → {chain}.
  const txRoute = (tx: StoredBridgeTx) => {
    const chain = cap(tx.tokenChain);
    return tx.type === "deposit" ? `${chain} → Starknet` : `Starknet → ${chain}`;
  };

  const STATUS_LABELS: Record<string, string> = {
    [BridgeTransferStatus.SUBMITTED_ON_L1]: "Submitted (L1)",
    [BridgeTransferStatus.CONFIRMED_ON_L1]: "Confirmed (L1)",
    [BridgeTransferStatus.COMPLETED_ON_L1]: "Completed (L1) ✓",
    [BridgeTransferStatus.NOT_SUBMITTED_ON_L1]: "Not on L1",
    [BridgeTransferStatus.SUBMITTED_ON_STARKNET]: "Submitted (Starknet)",
    [BridgeTransferStatus.CONFIRMED_ON_STARKNET]: "Confirmed (Starknet)",
    [BridgeTransferStatus.COMPLETED_ON_STARKNET]: "Completed (Starknet) ✓",
    [BridgeTransferStatus.NOT_SUBMITTED_ON_STARKNET]: "Not on Starknet",
    [BridgeTransferStatus.ERROR]: "Error",
  };
  const statusLabel = (s?: string) => (s ? (STATUS_LABELS[s] ?? s) : "pending");

  const PROTOCOL_LABELS: Record<string, string> = {
    canonical: "Canonical Bridge",
    cctp: "CCTP",
    oft: "OFT",
    "oft-migrated": "OFT (migrated)",
    hyperlane: "Hyperlane",
    layerswap: "Layerswap",
  };
  const protocolLabel = (p: string) => PROTOCOL_LABELS[p] ?? p;

  // A manual completion is only pending for a non-auto withdraw that is ready to
  // claim and hasn't had its completion tx submitted yet.
  const needsCompletion = (tx: StoredBridgeTx) =>
    tx.type === "initiateWithdraw" &&
    !tx.autoWithdraw &&
    !tx.externalTxHash &&
    tx.withdrawalState === WithdrawalState.READY_TO_CLAIM;

  async function onSubmit() {
    if (toStarknet) await deposit(amount);
    else await initiateWithdraw(amount);
    amount = "";
  }
</script>

<Text variant="title">Bridge</Text>

{#if !enabled}
  <Text variant="muted">
    Set VITE_REOWN_PROJECT_ID to enable bridging (connects external wallets via
    Reown/WalletConnect).
  </Text>
{:else if !s}
  <Text variant="muted">Loading…</Text>
{:else}
  <Card>
    <Text variant="label">External wallet</Text>
    {#if ethWallet}
      <Text variant="muted">Ethereum: {truncate(ethWallet.address)}</Text>
    {/if}
    {#if solWallet}
      <Text variant="muted">Solana: {truncate(solWallet.address)}</Text>
    {/if}
    <Button variant="secondary" title="Connect / manage wallet" onclick={openAppKit} />
  </Card>

  <Card>
    <Text variant="label">Direction</Text>
    <Select
      options={[
        { label: "To Starknet", value: "to-starknet" },
        { label: "From Starknet", value: "from-starknet" },
      ]}
      value={s.direction}
      oninput={(e: Event) =>
        setDirection((e.currentTarget as HTMLSelectElement).value as BridgeDirection)}
    />

    <Select
      label="Token"
      options={tokenOptions}
      value={s.selectedToken?.id ?? ""}
      oninput={(e: Event) =>
        selectToken((e.currentTarget as HTMLSelectElement).value || null)}
    />
    {#if s.tokensLoading}<Text variant="muted">Loading tokens…</Text>{/if}

    <TextField label="Amount" placeholder="0.0" inputmode="decimal" bind:value={amount} />

    <StatBox title="Balances" rows={balanceRows} />
    {#if s.allowance != null}
      <Text variant="muted">Allowance: {s.allowanceLoading ? "…" : s.allowance}</Text>
    {/if}

    <Toggle
      label="Fast transfer"
      checked={s.fastTransfer}
      oninput={(e: Event) =>
        setFastTransfer((e.currentTarget as HTMLInputElement).checked)}
    />
    <Toggle
      label="Auto-withdraw"
      checked={s.autoWithdraw}
      oninput={(e: Event) =>
        setAutoWithdraw((e.currentTarget as HTMLInputElement).checked)}
    />

    <Button
      variant="secondary"
      title="Estimate fee"
      loading={s.feeLoading}
      onclick={fetchFeeEstimate}
    />
    {#if feeRows.length}
      <StatBox title="Fees" rows={feeRows} />
    {/if}

    <Button
      title={toStarknet ? "Deposit" : "Initiate withdraw"}
      disabled={!s.selectedToken || !amount.trim()}
      onclick={onSubmit}
    />
    <Button variant="ghost" title="Refresh" loading={s.refreshing} onclick={refresh} />
    {#if s.error}<Text variant="muted">{s.error}</Text>{/if}
  </Card>

  {#if $history.length > 0}
    <div class="head">
      <Text variant="subtitle">Transfers</Text>
      <Button variant="ghost" title="Clear completed" onclick={clearCompletedTxRecords} />
    </div>
  {/if}
  {#each $history as tx (tx.id)}
    <Card>
      <div class="tx-head">
        <span class="left">
          <span class="sym">{txAmount(tx)}</span>
          <span class="protocol">{protocolLabel(tx.tokenProtocol)}</span>
        </span>
        <span class="route">{txRoute(tx)}</span>
      </div>
      {#if tx.externalTxHash}
        <HashRow label="L1" hash={tx.externalTxHash} href={externalExplorer(tx)} />
      {/if}
      {#if tx.snTxHash}
        <HashRow label="L2" hash={tx.snTxHash} href={starknetExplorer(tx.snTxHash)} />
      {/if}
      <Text variant="muted">{statusLabel(tx.lastStatus)}</Text>
      <div class="actions">
        <div class="btns">
          <Button
            variant="secondary"
            title="Check status"
            loading={checkingId === tx.id}
            onclick={() => onCheck(tx.id)}
          />
          {#if needsCompletion(tx)}
            <Button variant="secondary" title="Complete" onclick={() => completeBridgeTx(tx.id)} />
          {/if}
        </div>
        <button class="trash" aria-label="Remove" onclick={() => removeTxRecord(tx.id)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"
            />
          </svg>
        </button>
      </div>
    </Card>
  {/each}
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
  }
  .tx-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-md);
  }
  .left {
    display: flex;
    align-items: baseline;
    gap: var(--sp-sm);
    flex-wrap: wrap;
    min-width: 0;
  }
  .sym {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .protocol {
    font-size: 13px;
    color: var(--text-muted);
  }
  .route {
    font-size: 13px;
    color: var(--text-muted);
    text-align: right;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-sm);
  }
  .btns {
    display: flex;
    gap: var(--sp-sm);
    flex-wrap: wrap;
  }
  .trash {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    padding: 4px;
    color: var(--text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .trash:hover {
    color: var(--danger);
  }
</style>
