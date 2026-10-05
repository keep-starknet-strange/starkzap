<script lang="ts">
  import { onMount } from "svelte";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import Toggle from "~/lib/ui/Toggle.svelte";
  import { NETWORK, PAYCREST_KEY_CONFIGURED } from "~/lib/stores/config";
  import { sponsored, sponsoredAvailable } from "~/lib/stores/settings";
  import {
    direction,
    tokenSymbol,
    amount,
    fiatAmount,
    currency,
    institution,
    accountIdentifier,
    accountName,
    memo,
    tokens,
    currencies,
    institutions,
    quote,
    submitting,
    output,
    outcome,
    init,
    loadInstitutions,
    fetchQuote,
    submit,
  } from "./store";

  const DIRECTIONS = [
    { label: "Off-ramp", value: "offramp" },
    { label: "On-ramp", value: "onramp" },
  ];

  onMount(() => void init());

  $effect(() => void loadInstitutions($currency));

  // Debounced rate preview whenever the direction / pair / amount changes.
  $effect(() => {
    void [$direction, $tokenSymbol, $currency, $amount, $fiatAmount];
    const t = setTimeout(() => void fetchQuote(), 400);
    return () => clearTimeout(t);
  });

  const offramp = $derived($direction === "offramp");
  const mainnet = NETWORK === "mainnet";
  const canSubmit = $derived(
    mainnet &&
      PAYCREST_KEY_CONFIGURED &&
      !!$tokenSymbol &&
      !!$currency &&
      !!$institution &&
      !!$accountIdentifier.trim() &&
      !!$accountName.trim() &&
      !!(offramp ? $amount : $fiatAmount).trim()
  );

  const tokenOptions = $derived(
    $tokens.map((t) => ({ label: t.symbol, value: t.symbol }))
  );
  const currencyOptions = $derived(
    $currencies.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code }))
  );
  const institutionOptions = $derived(
    $institutions.map((i) => ({ label: `${i.name} (${i.type})`, value: i.code }))
  );
</script>

<Text variant="title">Fiat ramp</Text>
<Text variant="muted">
  Paycrest on/off-ramp with the connected wallet, via the Sender API.
</Text>

{#if !mainnet}
  <Card>
    <Text variant="muted">
      Paycrest is mainnet-only — switch the network badge to mainnet to submit
      orders. Rates still load here.
    </Text>
  </Card>
{:else if !PAYCREST_KEY_CONFIGURED}
  <Card>
    <Text variant="muted">
      Set PAYCREST_API_KEY in examples/web/.env and restart `npm run dev`. The
      dev server proxy adds it to Paycrest requests, so it never reaches the
      browser.
    </Text>
  </Card>
{/if}

<Segmented
  options={DIRECTIONS}
  value={$direction}
  onchange={(v: string) => direction.set(v as "offramp" | "onramp")}
/>

<Card>
  <Select label="Stablecoin" options={tokenOptions} bind:value={$tokenSymbol} />
  {#if offramp}
    <TextField
      label="Amount (stablecoin)"
      placeholder="0.0"
      inputmode="decimal"
      bind:value={$amount}
    />
  {:else}
    <TextField
      label="Amount (fiat)"
      placeholder="0"
      inputmode="decimal"
      bind:value={$fiatAmount}
    />
  {/if}
  <Select
    label="Fiat currency"
    options={currencyOptions}
    bind:value={$currency}
  />
  {#if $quote}
    <Text variant="muted">{$quote}</Text>
  {/if}
</Card>

<Card>
  <Text variant="label">
    {offramp ? "Recipient account" : "Refund account (if the order fails)"}
  </Text>
  <Select
    label="Bank / mobile money"
    options={institutionOptions}
    bind:value={$institution}
  />
  <TextField
    label="Account number"
    placeholder="0123456789"
    bind:value={$accountIdentifier}
  />
  <TextField
    label="Account name"
    placeholder="John Doe"
    bind:value={$accountName}
  />
  {#if offramp}
    <TextField
      label="Memo (optional)"
      placeholder="Payment narration"
      bind:value={$memo}
    />
  {/if}
</Card>

{#if offramp && sponsoredAvailable}
  <Toggle label="Sponsored" bind:checked={$sponsored} />
{/if}
<Button
  title={offramp ? "Off-ramp" : "On-ramp"}
  loading={$submitting}
  disabled={!canSubmit}
  onclick={submit}
/>

{#if $output.length}
  <Card>
    <pre class:ok={$outcome === "ok"} class:err={$outcome === "err"}>{$output.join(
        "\n"
      )}</pre>
  </Card>
{/if}

<style>
  pre {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
  }
  pre.ok {
    color: var(--success);
  }
  pre.err {
    color: var(--danger);
  }
</style>
