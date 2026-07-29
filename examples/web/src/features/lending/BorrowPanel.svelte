<script lang="ts">
  import { onMount } from "svelte";
  import type { LendingMarket } from "starkzap";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import Toggle from "~/lib/ui/Toggle.svelte";
  import { sponsored, sponsoredAvailable } from "~/lib/stores/settings";
  import {
    marketId,
    formatUsd18,
    markets,
    loadingMarkets,
    positions,
    collateralId,
    debtId,
    collateralAmount,
    borrowAmount,
    health,
    borrowSubmitting,
    borrowDryRunning,
    borrowDryRunResult,
    busyPosition,
    loadMarkets,
    setCollateral,
    setDebt,
    setCollateralAmount,
    setBorrowAmount,
    refreshHealth,
    borrow,
    borrowDryRun,
    repayPosition,
  } from "./store";

  onMount(loadMarkets);

  $effect(() => {
    void [$collateralId, $debtId];
    void refreshHealth();
  });

  const toOption = (m: LendingMarket) => ({
    // Pool name distinguishes the same asset across pools.
    label: m.poolName ? `${m.asset.symbol} · ${m.poolName}` : m.asset.symbol,
    value: marketId(m),
  });
  const collateral = $derived($markets.find((m) => marketId(m) === $collateralId));
  const collateralOptions = $derived($markets.map(toOption));
  // Debt must share the collateral's pool and be borrowable.
  const debtOptions = $derived(
    $markets
      .filter(
        (m) =>
          collateral &&
          m.poolAddress === collateral.poolAddress &&
          m.canBeBorrowed &&
          m.asset.address !== collateral.asset.address
      )
      .map(toOption)
  );
  const borrowPositions = $derived($positions.filter((p) => p.type === "borrow"));
</script>

{#if $loadingMarkets && $markets.length === 0}
  <Text variant="muted">Loading markets…</Text>
{:else if $markets.length === 0}
  <Text variant="muted">No lending markets on this network (Vesu is mainnet).</Text>
{:else}
  <Card>
    <Select
      label="Collateral"
      options={collateralOptions}
      value={$collateralId}
      oninput={(e: Event) =>
        setCollateral((e.currentTarget as HTMLSelectElement).value)}
    />
    <TextField
      label="Collateral amount"
      placeholder="0.0"
      inputmode="decimal"
      value={$collateralAmount}
      oninput={(e: Event) =>
        setCollateralAmount((e.currentTarget as HTMLInputElement).value)}
    />

    <Select
      label="Borrow"
      options={debtOptions}
      value={$debtId}
      oninput={(e: Event) =>
        setDebt((e.currentTarget as HTMLSelectElement).value)}
    />
    <TextField
      label="Borrow amount"
      placeholder="0.0"
      inputmode="decimal"
      value={$borrowAmount}
      oninput={(e: Event) =>
        setBorrowAmount((e.currentTarget as HTMLInputElement).value)}
    />

    {#if $health}
      <Text variant="muted">
        Collateral {formatUsd18($health.collateralValue)} · Debt {formatUsd18($health.debtValue)}
      </Text>
    {/if}

    {#if sponsoredAvailable}
      <Toggle label="Sponsored" bind:checked={$sponsored} />
    {/if}
    <Button
      title="Borrow"
      loading={$borrowSubmitting}
      disabled={!$collateralAmount.trim() || !$borrowAmount.trim() || !$debtId}
      onclick={borrow}
    />
    <Button
      variant="secondary"
      title="Dry run"
      loading={$borrowDryRunning}
      disabled={!$collateralAmount.trim() || !$borrowAmount.trim() || !$debtId}
      onclick={borrowDryRun}
    />
    {#if $borrowDryRunResult}
      <Text variant="muted">{$borrowDryRunResult.message}</Text>
    {/if}
  </Card>

  {#if borrowPositions.length > 0}
    <Text variant="subtitle">Your loans</Text>
  {/if}
  {#each borrowPositions as p (`${p.pool.id}:${p.debt?.token.address}`)}
    <Card>
      <Text variant="subtitle">
        {p.collateral.token.symbol} → {p.debt?.token.symbol ?? "—"}
      </Text>
      <Text variant="muted">
        Collateral {formatUsd18(p.collateral.usdValue)} · Debt {formatUsd18(p.debt?.usdValue)}
      </Text>
      {#if p.debt}
        <Button
          variant="ghost"
          title="Repay all"
          loading={$busyPosition === p.pool.id}
          onclick={() => repayPosition(p)}
        />
      {/if}
    </Card>
  {/each}
{/if}
