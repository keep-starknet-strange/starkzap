<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "title" | "subtitle" | "body" | "label" | "muted";
  let {
    variant = "body",
    children,
  }: { variant?: Variant; children: Snippet } = $props();
</script>

<span class={variant}>{@render children()}</span>

<style>
  span {
    display: block;
    color: var(--text);
  }
  .title {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .subtitle {
    font-size: 16px;
    font-weight: 600;
  }
  .body {
    font-size: 15px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }
  .muted {
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
