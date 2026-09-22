<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    center = false,
    children,
  }: { center?: boolean; children: Snippet } = $props();
</script>

<div class="screen" class:center>
  <div class="content">{@render children()}</div>
</div>

<style>
  .screen {
    height: 100%;
    overflow-y: auto;
  }
  .content {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--sp-lg);
    display: flex;
    flex-direction: column;
    gap: var(--sp-lg);
  }
  .center .content {
    min-height: 100%;
    justify-content: center;
  }
</style>
