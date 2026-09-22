<script lang="ts">
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import Toggle from "~/lib/ui/Toggle.svelte";
  import { tokens } from "~/lib/stores/tokens";
  import { sponsored, sponsoredAvailable } from "~/lib/stores/settings";
  import {
    items,
    submitting,
    addItem,
    updateItem,
    removeItem,
    send,
  } from "./store";

  const options = $derived(
    $tokens.map((t) => ({ label: `${t.symbol} — ${t.name}`, value: t.address }))
  );
</script>

<Text variant="title">Transfers</Text>
<Text variant="muted">Stack multiple rows — sent as one atomic transaction.</Text>

{#each $items as item (item.id)}
  <Card>
    <Select
      label="Token"
      options={options}
      value={item.tokenAddress}
      oninput={(e: Event) =>
        updateItem(item.id, {
          tokenAddress: (e.currentTarget as HTMLSelectElement).value,
        })}
    />
    <TextField
      label="Recipient"
      placeholder="0x…"
      value={item.to}
      oninput={(e: Event) =>
        updateItem(item.id, {
          to: (e.currentTarget as HTMLInputElement).value,
        })}
    />
    <TextField
      label="Amount"
      placeholder="0.0"
      inputmode="decimal"
      value={item.amount}
      oninput={(e: Event) =>
        updateItem(item.id, {
          amount: (e.currentTarget as HTMLInputElement).value,
        })}
    />
    {#if $items.length > 1}
      <Button
        variant="ghost"
        title="Remove"
        onclick={() => removeItem(item.id)}
      />
    {/if}
  </Card>
{/each}

<Button variant="secondary" title="+ Add transfer" onclick={addItem} />
{#if sponsoredAvailable}
  <Toggle label="Sponsored" bind:checked={$sponsored} />
{/if}
<Button title="Send" loading={$submitting} onclick={send} />
