<script lang="ts">
  export interface SegmentedOption {
    label: string;
    value: string;
  }

  let {
    options,
    value = $bindable(""),
    onchange,
  }: {
    options: SegmentedOption[];
    value?: string;
    onchange?: (value: string) => void;
  } = $props();

  function select(v: string) {
    value = v;
    onchange?.(v);
  }
</script>

<div class="row">
  {#each options as opt (opt.value)}
    <button class:active={opt.value === value} onclick={() => select(opt.value)}>
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .row {
    display: flex;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
  }
  button {
    flex: 1;
    padding: 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    border: none;
    border-radius: var(--r-sm);
    cursor: pointer;
  }
  .active {
    background: var(--primary);
    color: var(--primary-text);
  }
</style>
