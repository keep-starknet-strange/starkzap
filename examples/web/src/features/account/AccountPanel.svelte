<script lang="ts">
  import { onMount } from "svelte";
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
    getSessionHint,
  } from "~/lib/stores/wallet";
  import {
    privyEnabled,
    serverUrl as privyServerUrl,
    serverHealthy,
    loggedIn as privyLoggedIn,
    codeSent as privyCodeSent,
    busy as privyBusy,
    error as privyError,
    init as privyInit,
    checkServerHealth,
    sendCode as privySendCode,
    loginWithCode as privyLoginWithCode,
    logout as privyLogout,
  } from "~/lib/stores/privy";

  const presetOptions = Object.keys(ACCOUNT_PRESETS).map((k) => ({
    label: k,
    value: k,
  }));

  // Preselect the last-used login method/preset (see wallet store resumeSession).
  const hint = getSessionHint();
  let method = $state<"cartridge" | "privatekey" | "privy">(
    hint?.walletType ?? "cartridge"
  );
  let privateKey = $state("");
  let email = $state("");
  let otp = $state("");
  let presetName = $state(
    hint?.presetName ?? presetOptions[0]?.value ?? "argent"
  );
  let copied = $state(false);

  onMount(privyInit); // restores any existing Privy session

  // Ping the example server whenever the Privy tab is active.
  $effect(() => {
    if (method === "privy" && privyEnabled) void checkServerHealth();
  });

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
  {:else if !privyEnabled}
    <Text variant="muted">
      Set VITE_PRIVY_APP_ID and VITE_PRIVY_CLIENT_ID to enable Privy login.
    </Text>
  {:else if $privyLoggedIn}
    <Card>
      <Text variant="muted">Signed in with Privy.</Text>
      <Select label="Account preset" options={presetOptions} bind:value={presetName} />
      <Button
        title="Connect Starknet"
        loading={$walletState.connecting}
        onclick={() => connectPrivy(presetName)}
      />
      <Button variant="ghost" title="Log out" onclick={privyLogout} />
    </Card>
  {:else if !$privyCodeSent}
    <Card>
      <TextField label="Email" placeholder="you@example.com" bind:value={email} />
      <Button
        title="Send code"
        loading={$privyBusy}
        disabled={!email.includes("@")}
        onclick={() => privySendCode(email)}
      />
    </Card>
  {:else}
    <Card>
      <Text variant="muted">Enter the code sent to {email}</Text>
      <TextField label="Code" placeholder="6-digit code" bind:value={otp} />
      <Button
        title="Verify"
        loading={$privyBusy}
        disabled={otp.trim().length < 4}
        onclick={() => privyLoginWithCode(email, otp)}
      />
      <Button
        variant="ghost"
        title="Use a different email"
        onclick={() => {
          privyCodeSent.set(false);
          otp = "";
        }}
      />
    </Card>
  {/if}

  {#if method === "privy" && privyEnabled}
    {#if $serverHealthy}
      <Text variant="muted">🟢 Server running at {privyServerUrl}</Text>
    {:else}
      <Text variant="muted">Requires the example server (npm run dev:server).</Text>
    {/if}
  {/if}
  {#if $privyError}<Text variant="muted">{$privyError}</Text>{/if}
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
