<script lang="ts">
  import { onMount } from "svelte";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { balances } from "~/features/balances/store";
  import {
    apyLabel,
    strategies,
    unsupported,
    strategyId,
    amount,
    submitting,
    dryRunning,
    dryRunResult,
    positions,
    busyStrategy,
    loadStrategies,
    setStrategy,
    setAmount,
    deposit,
    dryRun,
    withdrawAll,
  } from "./store";

  onMount(loadStrategies);

  const options = $derived(
    $strategies.map((s) => ({ label: s.name, value: s.id }))
  );
  const selected = $derived($strategies.find((s) => s.id === $strategyId));
  const token = $derived(selected?.depositTokens[0]);
  const balance = $derived(
    token ? $balances.find((b) => b.token.address === token!.address)?.amount : undefined
  );
  const tracked = $derived(
    Object.entries($positions).filter(([, p]) => p) as [
      string,
      NonNullable<(typeof $positions)[string]>,
    ][]
  );
</script>

<Text variant="title">Yield</Text>

{#if $unsupported}
  <Text variant="muted">Yield strategies (Troves) are only available on Mainnet.</Text>
{:else if $strategies.length === 0}
  <Text variant="muted">Loading strategies…</Text>
{:else}
  <Card>
    <Select
      label="Strategy"
      options={options}
      value={$strategyId}
      oninput={(e: Event) =>
        setStrategy((e.currentTarget as HTMLSelectElement).value)}
    />
    {#if selected}
      <Text variant="muted">{apyLabel(selected)} · deposit {token?.symbol}</Text>
    {/if}
    <TextField
      label="Amount"
      placeholder="0.0"
      inputmode="decimal"
      value={$amount}
      oninput={(e: Event) =>
        setAmount((e.currentTarget as HTMLInputElement).value)}
    />
    <Text variant="muted">Balance: {balance ? balance.toFormatted(true) : "—"}</Text>
    <Button title="Deposit" loading={$submitting} disabled={!$amount.trim()} onclick={deposit} />
    <Button
      variant="secondary"
      title="Dry run"
      loading={$dryRunning}
      disabled={!$amount.trim()}
      onclick={dryRun}
    />
    {#if $dryRunResult}
      <Text variant="muted">{$dryRunResult.message}</Text>
    {/if}
  </Card>
{/if}

{#if tracked.length > 0}
  <Text variant="subtitle">Your positions</Text>
{/if}
{#each tracked as [id, p] (id)}
  {@const s = $strategies.find((x) => x.id === id)}
  <Card>
    <Text variant="subtitle">{s?.name ?? id}</Text>
    <Text variant="muted">
      Value: {p.amounts.map((a) => a.toFormatted(true)).join(" + ")}
    </Text>
    <Button
      variant="ghost"
      title="Withdraw all"
      loading={$busyStrategy === id}
      onclick={() => withdrawAll(id)}
    />
  </Card>
{/each}
