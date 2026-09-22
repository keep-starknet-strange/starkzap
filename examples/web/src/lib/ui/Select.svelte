<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";

  // Native <select> — the platform already gives us an accessible dropdown with
  // a scrim on mobile. (Logos aren't shown; native options are text-only.)
  export interface SelectOption {
    label: string;
    value: string;
  }

  let {
    options,
    value = $bindable(""),
    label,
    ...rest
  }: HTMLSelectAttributes & {
    options: SelectOption[];
    value?: string;
    label?: string;
  } = $props();
</script>

<label class="field">
  {#if label}<span class="label">{label}</span>{/if}
  <select bind:value {...rest}>
    {#each options as opt (opt.value)}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
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
  select {
    min-height: 48px;
    padding: 0 12px;
    font-size: 15px;
    color: var(--text);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    cursor: pointer;
  }
</style>
