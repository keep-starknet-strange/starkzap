<script lang="ts">
  import { onMount } from "svelte";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { balances } from "~/features/balances/store";
  import {
    validators,
    validatorKey,
    pools,
    loadingPools,
    poolContract,
    amount,
    submitting,
    dryRunning,
    dryRunResult,
    positions,
    busyPool,
    selectValidator,
    setPool,
    setAmount,
    stake,
    dryRun,
    claim,
    exitIntent,
    exit,
    refresh,
  } from "./store";

  onMount(refresh);

  const validatorOptions = [
    { label: "Select a validator", value: "" },
    ...Object.entries(validators()).map(([key, v]) => ({
      label: v.name,
      value: key,
    })),
  ];
  const poolOptions = $derived(
    $pools.map((p) => ({ label: p.token.symbol, value: p.poolContract }))
  );
  const selectedPool = $derived(
    $pools.find((p) => p.poolContract === $poolContract)
  );
  const balance = $derived(
    selectedPool
      ? $balances.find((b) => b.token.address === selectedPool!.token.address)
          ?.amount
      : undefined
  );
</script>

<Card>
  <Select
    label="Validator"
    options={validatorOptions}
    value={$validatorKey}
    oninput={(e: Event) =>
      selectValidator((e.currentTarget as HTMLSelectElement).value)}
  />

  {#if $validatorKey}
    {#if $loadingPools}
      <Text variant="muted">Loading pools…</Text>
    {:else if $pools.length}
      <Select
        label="Token"
        options={poolOptions}
        value={$poolContract}
        oninput={(e: Event) =>
          setPool((e.currentTarget as HTMLSelectElement).value)}
      />
      <TextField
        label="Amount"
        placeholder="0.0"
        inputmode="decimal"
        value={$amount}
        oninput={(e: Event) =>
          setAmount((e.currentTarget as HTMLInputElement).value)}
      />
      <Text variant="muted">
        Balance: {balance ? balance.toFormatted(true) : "—"}
      </Text>
      <Button
        title="Stake"
        loading={$submitting}
        disabled={!$amount.trim()}
        onclick={stake}
      />
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
    {:else}
      <Text variant="muted">No pools for this validator.</Text>
    {/if}
  {/if}
</Card>

{#if $positions.length > 0}
  <Text variant="subtitle">Your positions</Text>
{/if}
{#each $positions as p (p.pool.poolContract)}
  {@const member = p.member}
  {@const busy = $busyPool === p.pool.poolContract}
  <Card>
    <Text variant="subtitle">{p.validator.name} · {p.pool.token.symbol}</Text>
    <Text variant="muted">
      Staked: {member ? member.staked.toFormatted(true) : "—"}
    </Text>
    <Text variant="muted">
      Rewards: {member ? member.rewards.toFormatted(true) : "—"}
    </Text>
    {#if member && member.unpooling.toBase() > 0n}
      <Text variant="muted">
        Unpooling: {member.unpooling.toFormatted(true)}{member.unpoolTime
          ? ` · ready ${member.unpoolTime.toLocaleDateString()}`
          : ""}
      </Text>
    {/if}
    <div class="actions">
      {#if member && member.rewards.toBase() > 0n}
        <Button variant="secondary" title="Claim" loading={busy} onclick={() => claim(p)} />
      {/if}
      {#if member && member.staked.toBase() > 0n}
        <Button variant="ghost" title="Exit intent" loading={busy} onclick={() => exitIntent(p)} />
      {/if}
      {#if member && member.unpooling.toBase() > 0n}
        <Button variant="ghost" title="Exit" loading={busy} onclick={() => exit(p)} />
      {/if}
    </div>
  </Card>
{/each}

<style>
  .actions {
    display: flex;
    gap: var(--sp-sm);
    flex-wrap: wrap;
  }
</style>
