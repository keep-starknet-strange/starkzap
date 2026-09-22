<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  let {
    label,
    checked = $bindable(false),
    ...rest
  }: HTMLInputAttributes & { label: string; checked?: boolean } = $props();
</script>

<label class="toggle">
  <input type="checkbox" bind:checked {...rest} />
  <span class="track"><span class="thumb"></span></span>
  <span class="text">{label}</span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-sm);
    font-size: 14px;
    color: var(--text);
    cursor: pointer;
  }
  /* Visually hidden but focusable — the track/thumb render the switch. */
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    margin: 0;
  }
  .track {
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: var(--border);
    transition: background 0.15s;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s;
  }
  input:checked + .track {
    background: var(--accent);
  }
  input:checked + .track .thumb {
    transform: translateX(16px);
  }
  input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
