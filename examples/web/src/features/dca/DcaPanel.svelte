<script lang="ts">
  import { onMount } from "svelte";
  import { Amount } from "starkzap";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import Toggle from "~/lib/ui/Toggle.svelte";
  import { tokens } from "~/lib/stores/tokens";
  import { sponsored, sponsoredAvailable } from "~/lib/stores/settings";
  import { PROVIDER_OPTIONS_LIST } from "~/lib/stores/wallet";
  import { balances, refresh } from "~/features/balances/store";
  import {
    DCA_FREQUENCIES,
    sellToken,
    buyToken,
    total,
    cycle,
    frequency,
    providerId,
    preview,
    previewing,
    submitting,
    error,
    dryRunning,
    dryRunResult,
    orders,
    cancellingId,
    init,
    setSellToken,
    setBuyToken,
    setProvider,
    flip,
    fetchPreview,
    dryRun,
    createOrder,
    loadOrders,
    cancel,
  } from "./store";

  onMount(() => {
    init();
    void refresh();
  });

  $effect(() => {
    void $providerId;
    void loadOrders();
  });

  $effect(() => {
    void [$sellToken, $buyToken, $cycle, $providerId];
    const t = setTimeout(() => void fetchPreview(), 400);
    return () => clearTimeout(t);
  });

  const options = $derived(
    $tokens.map((t) => ({ label: t.symbol, value: t.address }))
  );
  const buyTok = $derived($tokens.find((t) => t.address === $buyToken));
  const sellBalance = $derived(
    $balances.find((b) => b.token.address === $sellToken)?.amount
  );
  const estPerCycle = $derived(
    $preview && buyTok
      ? Amount.fromRaw($preview.amountOutBase, buyTok).toFormatted(true)
      : "—"
  );

  const symbolOf = (addr: string) =>
    $tokens.find((t) => t.address === addr)?.symbol ?? `${addr.slice(0, 6)}…`;
  const amountFmt = (base: bigint, addr: string) => {
    const t = $tokens.find((tok) => tok.address === addr);
    return t ? Amount.fromRaw(base, t).toFormatted(true) : String(base);
  };
  const freqLabel = (f: string) =>
    DCA_FREQUENCIES.find((o) => o.value === f)?.label ??
    (f === "CONTINUOUS" ? "Continuous" : f);

  async function onCreate() {
    if (await createOrder()) void refresh();
  }
</script>

<Segmented
  options={PROVIDER_OPTIONS_LIST}
  value={$providerId}
  onchange={setProvider}
/>

<Card>
  <Text variant="label">You pay</Text>
  <Select
    options={options}
    value={$sellToken}
    oninput={(e: Event) =>
      setSellToken((e.currentTarget as HTMLSelectElement).value)}
  />
  <TextField
    label="Total amount"
    placeholder="0.0"
    inputmode="decimal"
    bind:value={$total}
  />
  <TextField
    label="Per cycle"
    placeholder="0.0"
    inputmode="decimal"
    bind:value={$cycle}
  />
  <Text variant="muted">
    Balance: {sellBalance ? sellBalance.toFormatted(true) : "—"}
  </Text>

  <button class="flip" onclick={flip} aria-label="Flip tokens">⇅</button>

  <Text variant="label">You receive</Text>
  <Select
    options={options}
    value={$buyToken}
    oninput={(e: Event) =>
      setBuyToken((e.currentTarget as HTMLSelectElement).value)}
  />

  <Select label="Frequency" options={DCA_FREQUENCIES} bind:value={$frequency} />

  <Text variant="body">
    {$previewing ? "Estimating…" : `≈ ${estPerCycle} per cycle`}
  </Text>

  {#if sponsoredAvailable}
    <Toggle label="Sponsored" bind:checked={$sponsored} />
  {/if}
  <Button
    title="Create DCA order"
    loading={$submitting}
    disabled={!$total.trim() || !$cycle.trim()}
    onclick={onCreate}
  />
  <Button
    variant="secondary"
    title="Dry run"
    loading={$dryRunning}
    disabled={!$total.trim() || !$cycle.trim()}
    onclick={dryRun}
  />
  {#if $dryRunResult}
    <Text variant="muted">{$dryRunResult.message}</Text>
  {/if}
</Card>

{#if $error}
  <Text variant="muted">{$error}</Text>
{/if}

{#if $orders.length > 0}
  <Text variant="subtitle">Active orders</Text>
{/if}
{#each $orders as order (order.id)}
  <Card>
    <Text variant="subtitle">
      {symbolOf(order.sellTokenAddress)} → {symbolOf(order.buyTokenAddress)}
    </Text>
    <Text variant="muted">
      {amountFmt(
        order.sellAmountPerCycleBase ?? order.sellAmountBase,
        order.sellTokenAddress
      )} per cycle • {freqLabel(order.frequency)}
    </Text>
    <Text variant="muted">
      {order.executedTradesCount}/{order.iterations} cycles • {order.status}
    </Text>
    {#if order.status !== "CLOSED"}
      <Button
        variant="ghost"
        title="Cancel"
        loading={$cancellingId === order.id}
        onclick={() => cancel(order)}
      />
    {/if}
  </Card>
{/each}

<style>
  .flip {
    align-self: center;
    font-size: 20px;
    line-height: 1;
    padding: var(--sp-xs) var(--sp-sm);
    color: var(--accent);
    background: transparent;
    border: none;
    cursor: pointer;
  }
</style>
