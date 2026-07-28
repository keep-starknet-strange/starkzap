<script lang="ts">
  import type { Component } from "svelte";
  import Screen from "~/lib/ui/Screen.svelte";
  import { walletState } from "~/lib/stores/wallet";
  import { NETWORK, switchNetwork } from "~/lib/stores/config";
  import { logs, clearLogs } from "~/lib/stores/logger";
  import AccountPanel from "~/features/account/AccountPanel.svelte";
  import BalancesPanel from "~/features/balances/BalancesPanel.svelte";
  import TransfersPanel from "~/features/transfers/TransfersPanel.svelte";
  import SwapScreen from "~/features/swap/SwapScreen.svelte";
  import StakingScreen from "~/features/staking/StakingScreen.svelte";
  import YieldPanel from "~/features/yield/YieldPanel.svelte";
  import PrivacyScreen from "~/features/privacy/PrivacyScreen.svelte";
  import LendingScreen from "~/features/lending/LendingScreen.svelte";
  import BridgePanel from "~/features/bridge/BridgePanel.svelte";

  // Ordered tabs mirroring mobile.
  const TABS: { key: string; label: string; component: Component }[] = [
    { key: "balances", label: "Balances", component: BalancesPanel },
    { key: "transfers", label: "Transfers", component: TransfersPanel },
    { key: "swap", label: "Swap", component: SwapScreen },
    { key: "staking", label: "Staking", component: StakingScreen },
    { key: "lending", label: "Lending", component: LendingScreen },
    { key: "privacy", label: "Privacy", component: PrivacyScreen },
    { key: "yield", label: "Yield", component: YieldPanel },
    { key: "bridge", label: "Bridge", component: BridgePanel },
  ];

  let active = $state("balances");
  let showAccount = $state(false);
  let showLogs = $state(false);
  let logBody = $state<HTMLDivElement | null>(null);

  const activeTab = $derived(TABS.find((t) => t.key === active));

  // Keep the log panel pinned to the latest entry.
  $effect(() => {
    void $logs.length;
    if (showLogs && logBody) logBody.scrollTop = logBody.scrollHeight;
  });
</script>

{#if !$walletState.wallet}
  <Screen center>
    <AccountPanel />
  </Screen>
{:else}
  <div class="app">
    <header>
      <span class="brand">Starkzap</span>
      <div class="header-actions">
        <button
          class="net-badge"
          title="Switch network"
          onclick={() =>
            switchNetwork(NETWORK === "sepolia" ? "mainnet" : "sepolia")}
        >
          <span class="net-dot" class:mainnet={NETWORK === "mainnet"}></span>
          {NETWORK}
        </button>
        <button
          class="icon-btn"
          class:active={showLogs}
          aria-label="Logs"
          title="Logs"
          onclick={() => (showLogs = !showLogs)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              d="M4 7h16M4 12h16M4 17h10"
            />
          </svg>
        </button>
        <button
          class="icon-btn"
          class:active={showAccount}
          aria-label="Account"
          title="Account"
          onclick={() => (showAccount = !showAccount)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
            />
          </svg>
        </button>
      </div>
    </header>

    {#if showAccount}
      <Screen><AccountPanel /></Screen>
    {:else}
      <nav>
        {#each TABS as tab (tab.key)}
          <button
            class:selected={tab.key === active}
            onclick={() => (active = tab.key)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>
      <Screen>
        {#if activeTab}
          {@const Panel = activeTab.component}
          <Panel />
        {/if}
      </Screen>
    {/if}

    {#if showLogs}
      <div class="log-panel">
        <div class="log-head">
          <span class="log-title">Logs</span>
          <div class="log-head-actions">
            <button class="log-link" onclick={clearLogs}>Clear</button>
            <button class="log-link" onclick={() => (showLogs = false)}>
              Close
            </button>
          </div>
        </div>
        <div class="log-body" bind:this={logBody}>
          {#if $logs.length === 0}
            <div class="log-empty">No logs yet.</div>
          {:else}
            {#each $logs as entry, i (i)}
              <div class="log-row level-{entry.level}">
                <span class="log-time">{entry.time}</span>
                <span class="log-msg">[{entry.source}] {entry.message}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-md) var(--sp-lg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .brand {
    font-weight: 700;
    font-size: 18px;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-sm);
  }
  .net-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    text-transform: capitalize;
    cursor: pointer;
  }
  .net-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }
  .net-dot.mainnet {
    background: var(--success);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    cursor: pointer;
  }
  .icon-btn.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  nav {
    display: flex;
    gap: var(--sp-sm);
    padding: var(--sp-sm) var(--sp-lg);
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  nav button {
    flex: 0 0 auto;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    border: none;
    border-radius: var(--r-md);
    cursor: pointer;
    white-space: nowrap;
  }
  nav button.selected {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .log-panel {
    display: flex;
    flex-direction: column;
    height: min(40vh, 320px);
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--card);
  }
  .log-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-sm) var(--sp-lg);
    border-bottom: 1px solid var(--border);
  }
  .log-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }
  .log-head-actions {
    display: flex;
    gap: var(--sp-md);
  }
  .log-link {
    font-size: 13px;
    color: var(--text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .log-link:hover {
    color: var(--text);
  }
  .log-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-sm) var(--sp-lg);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
  }
  .log-empty {
    color: var(--text-muted);
  }
  .log-row {
    display: flex;
    gap: var(--sp-sm);
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .log-time {
    flex-shrink: 0;
    color: var(--text-muted);
  }
  .level-error .log-msg {
    color: var(--danger);
  }
  .level-success .log-msg {
    color: var(--success);
  }
  .level-warn .log-msg,
  .level-debug .log-msg {
    color: var(--text-muted);
  }
</style>
