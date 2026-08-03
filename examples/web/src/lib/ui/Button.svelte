<script lang="ts">
  import type { Snippet } from "svelte";

  type Variant = "primary" | "secondary" | "ghost" | "danger";
  let {
    title = "",
    onclick,
    variant = "primary",
    loading = false,
    disabled = false,
    children,
  }: {
    title?: string;
    onclick?: () => void;
    variant?: Variant;
    loading?: boolean;
    disabled?: boolean;
    children?: Snippet;
  } = $props();
</script>

<button
  class={variant}
  {onclick}
  disabled={disabled || loading}
  aria-busy={loading}
>
  <!-- Label stays in the layout (just hidden) so the width doesn't jump when
       the spinner overlays it. -->
  <span class="label" class:hidden={loading}>
    {#if children}{@render children()}{:else}{title}{/if}
  </span>
  {#if loading}<span class="spinner"></span>{/if}
</button>

<style>
  button {
    position: relative;
    min-height: 48px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    border-radius: var(--r-md);
    border: 1px solid transparent;
    cursor: pointer;
    transition: opacity 0.12s;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .label.hidden {
    visibility: hidden;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:not(:disabled):active {
    opacity: 0.85;
  }
  .primary {
    background: var(--primary);
    color: var(--primary-text);
  }
  .secondary {
    background: var(--card);
    color: var(--text);
    border-color: var(--border);
  }
  .ghost {
    background: transparent;
    color: var(--text);
  }
  .danger {
    background: var(--danger);
    color: #fff;
  }
  .spinner {
    /* Centered overlay so the label can keep the button's width. */
    position: absolute;
    inset: 0;
    margin: auto;
    width: 18px;
    height: 18px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
