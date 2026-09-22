<script lang="ts">
  import { onMount } from "svelte";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { addToken, removeToken, isCustom } from "~/lib/stores/tokens";
  import { balances, loading, refresh } from "./store";

  onMount(refresh);

  let adding = $state(false);
  let newAddress = $state("");
  let importing = $state(false);
  let importError = $state<string | null>(null);

  async function onImport() {
    importing = true;
    importError = null;
    try {
      await addToken(newAddress);
      newAddress = "";
      adding = false;
      await refresh(); // pick up the new token's balance
    } catch (err) {
      importError = String(err instanceof Error ? err.message : err);
    } finally {
      importing = false;
    }
  }

  async function onRemove(address: string) {
    removeToken(address);
    await refresh();
  }
</script>

<div class="head">
  <Text variant="title">Balances</Text>
  <Button
    variant="secondary"
    title="Refresh"
    loading={$loading}
    onclick={refresh}
  />
</div>

{#if $balances.length === 0}
  <Text variant="muted">
    {$loading ? "Loading…" : "No balances yet."}
  </Text>
{:else}
  {#each $balances as { token, amount } (token.address)}
    <Card>
      <div class="row">
        <div class="left">
          {#if token.metadata?.logoUrl?.href}
            <img src={token.metadata.logoUrl.href} alt={token.symbol} />
          {:else}
            <span class="placeholder">{token.symbol[0]}</span>
          {/if}
          <div>
            <Text variant="body">{token.name}</Text>
            <Text variant="muted">{token.symbol}</Text>
          </div>
        </div>
        <div class="right">
          <Text variant="body">{amount.toFormatted(true)}</Text>
          {#if isCustom(token.address)}
            <button
              class="remove"
              aria-label="Remove token"
              title="Remove token"
              onclick={() => onRemove(token.address)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"
                />
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </Card>
  {/each}
{/if}

<Button
  variant="secondary"
  title={adding ? "Cancel" : "Add token"}
  onclick={() => (adding = !adding)}
/>
{#if adding}
  <Card>
    <TextField label="Token address" placeholder="0x…" bind:value={newAddress} />
    {#if importError}<Text variant="muted">{importError}</Text>{/if}
    <Button
      title="Import"
      loading={importing}
      disabled={!newAddress.trim()}
      onclick={onImport}
    />
  </Card>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
  }
  .left {
    display: flex;
    align-items: center;
    gap: var(--sp-md);
    min-width: 0;
  }
  .right {
    display: flex;
    align-items: center;
    gap: var(--sp-sm);
    flex-shrink: 0;
  }
  .remove {
    display: grid;
    place-items: center;
    padding: 2px;
    color: var(--text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .remove:hover {
    color: var(--danger);
  }
  img,
  .placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .placeholder {
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 13px;
  }
</style>
