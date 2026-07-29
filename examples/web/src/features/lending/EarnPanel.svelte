<script lang="ts">
  import { onMount } from "svelte";
  import { Amount } from "starkzap";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import Toggle from "~/lib/ui/Toggle.svelte";
  import { balances } from "~/features/balances/store";
  import { sponsored, sponsoredAvailable } from "~/lib/stores/settings";
  import {
    marketId,
    formatUsd18,
    markets,
    loadingMarkets,
    positions,
    earnMarketId,
    earnAmount,
    earnSubmitting,
    earnDryRunning,
    earnDryRunResult,
    busyPosition,
    loadMarkets,
    setEarnMarket,
    setEarnAmount,
    deposit,
    earnDryRun,
    withdrawPosition,
  } from "./store";

  onMount(loadMarkets);

  const options = $derived(
    $markets.map((m) => ({
      label: m.poolName ? `${m.asset.symbol} · ${m.poolName}` : m.asset.symbol,
      value: marketId(m),
    }))
  );
  const selected = $derived($markets.find((m) => marketId(m) === $earnMarketId));
  const balance = $derived(
    selected
      ? $balances.find((b) => b.token.address === selected!.asset.address)?.amount
      : undefined
  );
  const earnPositions = $derived($positions.filter((p) => p.type === "earn"));
</script>

{#if $loadingMarkets && $markets.length === 0}
  <Text variant="muted">Loading markets…</Text>
{:else if $markets.length === 0}
  <Text variant="muted">No lending markets on this network (Vesu is mainnet).</Text>
{:else}
  <Card>
    <Select
      label="Market"
      options={options}
      value={$earnMarketId}
      oninput={(e: Event) =>
        setEarnMarket((e.currentTarget as HTMLSelectElement).value)}
    />
    {#if selected?.stats?.supplyApy}
      <Text variant="muted">Supply APY: {selected.stats.supplyApy.toFormatted(true)}</Text>
    {/if}
    <TextField
      label="Amount"
      placeholder="0.0"
      inputmode="decimal"
      value={$earnAmount}
      oninput={(e: Event) =>
        setEarnAmount((e.currentTarget as HTMLInputElement).value)}
    />
    <Text variant="muted">Balance: {balance ? balance.toFormatted(true) : "—"}</Text>
    {#if sponsoredAvailable}
      <Toggle label="Sponsored" bind:checked={$sponsored} />
    {/if}
    <Button title="Deposit" loading={$earnSubmitting} disabled={!$earnAmount.trim()} onclick={deposit} />
    <Button
      variant="secondary"
      title="Dry run"
      loading={$earnDryRunning}
      disabled={!$earnAmount.trim()}
      onclick={earnDryRun}
    />
    {#if $earnDryRunResult}
      <Text variant="muted">{$earnDryRunResult.message}</Text>
    {/if}
  </Card>

  {#if earnPositions.length > 0}
    <Text variant="subtitle">Your deposits</Text>
  {/if}
  {#each earnPositions as p (p.pool.id)}
    <Card>
      <Text variant="subtitle">
        {p.collateral.token.symbol}{p.pool.name ? ` · ${p.pool.name}` : ""}
      </Text>
      <Text variant="muted">
        Supplied: {Amount.fromRaw(p.collateral.amount, p.collateral.token).toFormatted(true)}
        · {formatUsd18(p.collateral.usdValue)}
      </Text>
      <Button
        variant="ghost"
        title="Withdraw all"
        loading={$busyPosition === p.pool.id}
        onclick={() => withdrawPosition(p)}
      />
    </Card>
  {/each}
{/if}
