<script lang="ts">
  import { ec } from "starknet";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { NETWORK, switchNetwork, ACCOUNT_PRESETS } from "~/lib/stores/config";
  import type { AppNetwork } from "~/lib/stores/config";
  import {
    walletState,
    connectCartridge,
    connectPrivateKey,
    connectPrivy,
    deploy,
    disconnect,
  } from "~/lib/stores/wallet";

  const presetOptions = Object.keys(ACCOUNT_PRESETS).map((k) => ({
    label: k,
    value: k,
  }));

  let method = $state<"cartridge" | "privatekey" | "privy">("cartridge");
  let privateKey = $state("");
  let email = $state("");
  let presetName = $state(presetOptions[0]?.value ?? "argent");
  let copied = $state(false);

  function generateKey() {
    const bytes = ec.starkCurve.utils.randomPrivateKey();
    privateKey =
      "0x" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  }

  async function copyAddress() {
    if (!$walletState.address) return;
    await navigator.clipboard.writeText($walletState.address);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

{#if $walletState.wallet}
  <Text variant="title">Account</Text>
  <Card>
    <Text variant="label">Address</Text>
    <button class="address" onclick={copyAddress}>
      {$walletState.address}
    </button>
    <Text variant="muted">{copied ? "Copied!" : "Tap to copy"}</Text>
    <Text variant="muted">
      Status: {$walletState.isDeployed == null
        ? "unknown"
        : $walletState.isDeployed
          ? "deployed"
          : "not deployed"}
    </Text>
    {#if $walletState.isDeployed === false}
      <Button
        title="Deploy account"
        loading={$walletState.connecting}
        onclick={deploy}
      />
    {/if}
    <Button variant="danger" title="Disconnect" onclick={disconnect} />
  </Card>
{:else}
  <Text variant="title">Connect</Text>

  <Card>
    <Text variant="label">Network</Text>
    <Text variant="body">{NETWORK}</Text>
    <Button
      variant="secondary"
      title={NETWORK === "sepolia" ? "Switch to Mainnet" : "Switch to Sepolia"}
      onclick={() =>
        switchNetwork((NETWORK === "sepolia" ? "mainnet" : "sepolia") as AppNetwork)}
    />
    <Text variant="muted">Switching reloads the app.</Text>
  </Card>

  <Segmented
    options={[
      { label: "Cartridge", value: "cartridge" },
      { label: "Private key", value: "privatekey" },
      { label: "Privy", value: "privy" },
    ]}
    bind:value={method}
  />

  {#if $walletState.error}
    <Text variant="muted">{$walletState.error}</Text>
  {/if}

  {#if method === "cartridge"}
    <Button
      title="Sign in with Cartridge"
      loading={$walletState.connecting}
      onclick={connectCartridge}
    />
  {:else if method === "privatekey"}
    <Card>
      <TextField label="Private key" placeholder="0x…" bind:value={privateKey} />
      <Button variant="secondary" title="Generate key" onclick={generateKey} />
      <Select label="Account preset" options={presetOptions} bind:value={presetName} />
      <Button
        title="Connect"
        loading={$walletState.connecting}
        onclick={() => connectPrivateKey(privateKey, presetName)}
      />
    </Card>
  {:else}
    <Card>
      <TextField label="Email" placeholder="you@example.com" bind:value={email} />
      <Select label="Account preset" options={presetOptions} bind:value={presetName} />
      <Button
        title="Connect"
        loading={$walletState.connecting}
        onclick={() => connectPrivy(email, presetName)}
      />
      <Text variant="muted">Requires the example server (npm run dev:server).</Text>
    </Card>
  {/if}
{/if}

<style>
  .address {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    word-break: break-all;
  }
</style>
