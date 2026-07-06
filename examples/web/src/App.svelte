<script lang="ts">
  import type { Component } from "svelte";
  import Screen from "~/lib/ui/Screen.svelte";
  import { walletState } from "~/lib/stores/wallet";
  import AccountPanel from "~/features/account/AccountPanel.svelte";
  import BalancesPanel from "~/features/balances/BalancesPanel.svelte";
  import TransfersPanel from "~/features/transfers/TransfersPanel.svelte";
  import SwapScreen from "~/features/swap/SwapScreen.svelte";
  import StakingScreen from "~/features/staking/StakingScreen.svelte";
  import YieldPanel from "~/features/yield/YieldPanel.svelte";
  import PrivacyPanel from "~/features/privacy/PrivacyPanel.svelte";
  import LendingScreen from "~/features/lending/LendingScreen.svelte";
  import BridgePanel from "~/features/bridge/BridgePanel.svelte";

  // Ordered tabs mirroring mobile.
  const TABS: { key: string; label: string; component: Component }[] = [
    { key: "balances", label: "Balances", component: BalancesPanel },
    { key: "transfers", label: "Transfers", component: TransfersPanel },
    { key: "swap", label: "Swap", component: SwapScreen },
    { key: "staking", label: "Staking", component: StakingScreen },
    { key: "lending", label: "Lending", component: LendingScreen },
    { key: "privacy", label: "Privacy", component: PrivacyPanel },
    { key: "yield", label: "Yield", component: YieldPanel },
    { key: "bridge", label: "Bridge", component: BridgePanel },
  ];

  let active = $state("balances");
  let showAccount = $state(false);

  const activeTab = $derived(TABS.find((t) => t.key === active));
</script>

{#if !$walletState.wallet}
  <Screen center>
    <AccountPanel />
  </Screen>
{:else}
  <div class="app">
    <header>
      <span class="brand">Starkzap</span>
      <button
        class="account"
        class:active={showAccount}
        aria-label="Account"
        onclick={() => (showAccount = !showAccount)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
          />
        </svg>
      </button>
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
  }
  .brand {
    font-weight: 700;
    font-size: 18px;
  }
  .account {
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
  .account.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  nav {
    display: flex;
    gap: var(--sp-sm);
    padding: var(--sp-sm) var(--sp-lg);
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
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
</style>
