<script lang="ts">
  export interface StatRow {
    label: string;
    value: string;
  }
  let { title, rows }: { title: string; rows: StatRow[] } = $props();
</script>

<div class="box">
  <span class="box-title">{title}</span>
  {#each rows as r (r.label)}
    <div class="row">
      <span class="label">{r.label}</span>
      <span class="value">{r.value}</span>
    </div>
  {/each}
</div>

<style>
  .box {
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: var(--sp-md);
  }
  .box-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-md);
  }
  .label {
    font-size: 13px;
    color: var(--text-muted);
  }
  .value {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    text-align: right;
  }
</style>
