<script lang="ts">
  import { Amount } from "starkzap";
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { PRIVACY_PROVIDERS } from "./providers";
  import {
    providerId,
    tokenSymbol,
    instance,
    token,
    connecting,
    busy,
    address,
    balance,
    pending,
    error,
    enabled,
    setProvider,
    setToken,
    connect,
    refresh,
    fund,
    withdraw,
    transfer,
    rollover,
  } from "./store";

  let fundAmount = $state("");
  let withdrawAmount = $state("");
  let sendAmount = $state("");
  let sendKey = $state("");
  let copied = $state(false);

  async function copyKey() {
    await navigator.clipboard.writeText($address);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }

  const providerOptions = PRIVACY_PROVIDERS.map((p) => ({
    label: p.label,
    value: p.id,
  }));
  const def = $derived(PRIVACY_PROVIDERS.find((p) => p.id === $providerId));
  const tokenOptions = $derived([
    { label: "Select a token", value: "" },
    ...(def?.tokens().map((t) => ({ label: t.symbol, value: t.symbol })) ?? []),
  ]);
  const fmt = (base: bigint) =>
    $token ? Amount.fromRaw(base, $token.decimals, $token.symbol).toFormatted(true) : "—";

  async function onFund() {
    await fund(fundAmount);
    fundAmount = "";
  }
  async function onWithdraw() {
    await withdraw(withdrawAmount);
    withdrawAmount = "";
  }
  async function onSend() {
    await transfer(sendAmount, sendKey);
    sendAmount = "";
  }
</script>

<Text variant="title">Privacy</Text>

{#if !$enabled}
  <Text variant="muted">
    Confidential balances require a private-key login (the capability is derived
    from your key at sign-in).
  </Text>
{:else}
  <Card>
    <Select
      label="Provider"
      options={providerOptions}
      value={$providerId}
      oninput={(e: Event) =>
        setProvider((e.currentTarget as HTMLSelectElement).value)}
    />
    <Select
      label="Token"
      options={tokenOptions}
      value={$tokenSymbol}
      oninput={(e: Event) =>
        setToken((e.currentTarget as HTMLSelectElement).value)}
    />
    <Button
      title="Connect"
      loading={$connecting}
      disabled={!$tokenSymbol}
      onclick={connect}
    />
    {#if $error}<Text variant="muted">{$error}</Text>{/if}
  </Card>

  {#if $instance}
    <Card>
      <Text variant="subtitle">Confidential {$token?.symbol}</Text>
      <Text variant="muted">Balance: {fmt($balance)}</Text>
      <Text variant="muted">Pending: {fmt($pending)}</Text>
      {#if $address}
        <Text variant="label">Public key (share to receive)</Text>
        <button class="pubkey" onclick={copyKey}>{$address}</button>
        <Text variant="muted">{copied ? "Copied!" : "Tap to copy"}</Text>
      {/if}
      <Button variant="secondary" title="Refresh" onclick={refresh} />
    </Card>

    <Card>
      <Text variant="subtitle">Shield (deposit)</Text>
      <TextField label="Amount" placeholder="0.0" inputmode="decimal" bind:value={fundAmount} />
      <Button title="Shield" loading={$busy} disabled={!fundAmount.trim()} onclick={onFund} />
    </Card>

    <Card>
      <Text variant="subtitle">Private send</Text>
      <TextField label="Amount" placeholder="0.0" inputmode="decimal" bind:value={sendAmount} />
      <TextField
        label="Recipient public key"
        placeholder="Tongo public key…"
        bind:value={sendKey}
      />
      <Button
        title="Send privately"
        loading={$busy}
        disabled={!sendAmount.trim() || !sendKey.trim()}
        onclick={onSend}
      />
    </Card>

    <Card>
      <Text variant="subtitle">Unshield (withdraw)</Text>
      <TextField label="Amount" placeholder="0.0" inputmode="decimal" bind:value={withdrawAmount} />
      <Text variant="muted">Unshields to your wallet address.</Text>
      <Button
        title="Unshield"
        loading={$busy}
        disabled={!withdrawAmount.trim()}
        onclick={onWithdraw}
      />
      <Button variant="ghost" title="Rollover pending" loading={$busy} onclick={rollover} />
    </Card>
  {/if}
{/if}

<style>
  .pubkey {
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
