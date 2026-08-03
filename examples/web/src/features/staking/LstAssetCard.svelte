<script lang="ts">
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { balances } from "~/features/balances/store";
  import { positions, busyAsset, enter, exit } from "./lst-store";

  let { asset }: { asset: string } = $props();
  let amount = $state("");

  const member = $derived($positions[asset]);
  const busy = $derived($busyAsset === asset);
  const balance = $derived(
    $balances.find((b) => b.token.symbol === asset)?.amount
  );
  const staked = $derived(
    member && member.staked.toBase() > 0n ? member.staked : null
  );

  async function onStake() {
    if (await enter(asset, amount)) amount = "";
  }
</script>

<Card>
  <Text variant="subtitle">Liquid stake {asset}</Text>
  <TextField label="Amount" placeholder="0.0" inputmode="decimal" bind:value={amount} />
  <Text variant="muted">Balance: {balance ? balance.toFormatted(true) : "—"}</Text>
  <Button
    title={`Stake ${asset}`}
    loading={busy}
    disabled={!amount.trim()}
    onclick={onStake}
  />
  {#if staked}
    <Text variant="muted">Staked: {staked.toFormatted(true)}</Text>
    <Button variant="ghost" title="Exit" loading={busy} onclick={() => exit(asset)} />
  {/if}
</Card>
