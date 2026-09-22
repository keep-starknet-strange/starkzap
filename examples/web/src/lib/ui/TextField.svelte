<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    label,
    value = $bindable(""),
    right,
    ...rest
  }: HTMLInputAttributes & {
    label?: string;
    value?: string;
    right?: Snippet;
  } = $props();
</script>

<label class="field">
  {#if label}<span class="label">{label}</span>{/if}
  <span class="row">
    <input bind:value {...rest} />
    {#if right}{@render right()}{/if}
  </span>
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding-right: 6px;
    background: var(--card);
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 12px 14px;
    font-size: 15px;
    color: var(--text);
    background: transparent;
    border: none;
    outline: none;
  }
  input::placeholder {
    color: var(--text-muted);
  }
</style>
