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
  import { sponsored } from "~/lib/stores/settings";
  import { PROVIDER_OPTIONS_LIST } from "~/lib/stores/wallet";
  import { balances, refresh } from "~/features/balances/store";
  import {
    tokenIn,
    tokenOut,
    amountIn,
    providerId,
    quote,
    quoting,
    submitting,
    error,
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
  } from "./store";

  onMount(() => {
    init();
    void refresh();
  });

  // Debounced quote whenever the pair / amount / provider changes.
  $effect(() => {
    void [$tokenIn, $tokenOut, $amountIn, $providerId];
    const t = setTimeout(() => void fetchQuote(), 400);
    return () => clearTimeout(t);
  });

  const options = $derived(
    $tokens.map((t) => ({ label: t.symbol, value: t.address }))
  );
  const outTok = $derived($tokens.find((t) => t.address === $tokenOut));
  const inBalance = $derived(
    $balances.find((b) => b.token.address === $tokenIn)?.amount
  );
  const estOut = $derived(
    $quote && outTok
      ? Amount.fromRaw($quote.amountOutBase, outTok).toFormatted(true)
      : "—"
  );

  async function onSwap() {
    if (await swap()) void refresh();
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
    value={$tokenIn}
    oninput={(e: Event) =>
      setTokenIn((e.currentTarget as HTMLSelectElement).value)}
  />
  <TextField
    label="Amount"
    placeholder="0.0"
    inputmode="decimal"
    value={$amountIn}
    oninput={(e: Event) =>
      setAmountIn((e.currentTarget as HTMLInputElement).value)}
  />
  <Text variant="muted">
    Balance: {inBalance ? inBalance.toFormatted(true) : "—"}
  </Text>

  <button class="flip" onclick={flip} aria-label="Flip tokens">⇅</button>

  <Text variant="label">You receive</Text>
  <Select
    options={options}
    value={$tokenOut}
    oninput={(e: Event) =>
      setTokenOut((e.currentTarget as HTMLSelectElement).value)}
  />
  <Text variant="body">{$quoting ? "Quoting…" : `≈ ${estOut}`}</Text>
  {#if $quote?.priceImpactBps != null}
    <Text variant="muted">
      Price impact: {(Number($quote.priceImpactBps) / 100).toFixed(2)}%{$quote.provider
        ? ` • ${$quote.provider}`
        : ""}
    </Text>
  {/if}
</Card>

<Toggle label="Sponsored (gasless)" bind:checked={$sponsored} />
<Button
  title="Swap"
  loading={$submitting}
  disabled={!$quote || $quoting}
  onclick={onSwap}
/>
<Button
  variant="secondary"
  title="Dry run"
  loading={$dryRunning}
  disabled={!$amountIn.trim()}
  onclick={dryRun}
/>
{#if $dryRunResult}
  <Text variant="muted">{$dryRunResult.message}</Text>
{/if}
{#if $error}
  <Text variant="muted">{$error}</Text>
{/if}

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
