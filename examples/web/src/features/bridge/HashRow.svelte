<script lang="ts">
  let {
    label,
    hash,
    href,
  }: { label: string; hash: string; href?: string } = $props();

  let copied = $state(false);
  const short = $derived(`${hash.slice(0, 8)}…${hash.slice(-6)}`);

  async function copy() {
    await navigator.clipboard.writeText(hash);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<div class="row">
  {#if href}
    <a class="text link" {href} target="_blank" rel="noopener noreferrer">
      {label}: {short}
    </a>
  {:else}
    <span class="text">{label}: {short}</span>
  {/if}
  <button
    class="copy"
    class:copied
    aria-label={`Copy ${label} hash`}
    title="Copy hash"
    onclick={copy}
  >
    {#if copied}
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M5 13l4 4L19 7"
        />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4Zm2 0h2a2 2 0 0 1 2 2v2h4V5h-8v4Z"
        />
      </svg>
    {/if}
  </button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
  }
  .text {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .link {
    color: var(--accent);
    text-decoration: none;
  }
  .link:hover {
    text-decoration: underline;
  }
  .copy {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    padding: 4px;
    color: var(--text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .copy:hover {
    color: var(--text);
  }
  .copy.copied {
    color: var(--success);
  }
</style>
