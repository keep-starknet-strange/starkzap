<script lang="ts">
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { tokens } from "~/lib/stores/tokens";
  import { walletState } from "~/lib/stores/wallet";
  import {
    balances,
    blocksUntilProvable,
    busy,
    client,
    connect,
    connecting,
    deposit,
    error,
    finishDeposit,
    pendingDeposit,
    recipientReady,
    refresh,
    register,
    registered,
    step,
    transfer,
    unavailableReason,
    waiting,
    withdraw,
  } from "./store";

  const reason = $derived(unavailableReason($walletState.walletType));

  let symbol = $state("");
  const token = $derived($tokens.find((t) => t.symbol === symbol));

  let depositAmount = $state("");
  let sendAmount = $state("");
  let sendTo = $state("");
  let withdrawAmount = $state("");

  // Whether the recipient has registered a viewing key. The SDK cannot build a
  // transfer to an account without one, so this is checked before offering it.
  let toReady = $state<boolean | null>(null);
  async function checkRecipient() {
    toReady = token && sendTo.trim() ? await recipientReady(sendTo, token) : null;
  }

  const tokenOptions = $derived([
    { label: "Select a token", value: "" },
    ...$tokens.map((t) => ({ label: t.symbol, value: t.symbol })),
  ]);

  // Actions are blocked while the chain catches up: a proof must read state that
  // is already ~10 blocks old.
  const blocked = $derived($busy || $waiting);
</script>

{#if reason}
  <Text variant="muted">{reason}</Text>
{:else if !$client}
  <Card>
    <Text variant="subtitle">STRK20 privacy pool</Text>
    <Text variant="muted">
      One pool for every token. Your viewing key is derived from your signing
      key, so nothing extra is stored.
    </Text>
    <Button title="Connect" loading={$connecting} onclick={connect} />
    {#if $error}<Text variant="muted">{$error}</Text>{/if}
  </Card>
{:else}
  <!-- Status: registration, and the block countdown when one is running. -->
  <Card>
    <div class="head">
      <Text variant="subtitle">Status</Text>
      <Button
        variant="secondary"
        title="Refresh"
        loading={$busy}
        onclick={refresh}
      />
    </div>
    <Text variant="muted">
      {$registered === null
        ? "Checking registration…"
        : $registered
          ? "Registered — ready to transact."
          : "Not registered yet. Depositing registers you automatically."}
    </Text>

    {#if $waiting}
      <div class="wait">
        <Text variant="label">
          Waiting {$blocksUntilProvable} block{$blocksUntilProvable === 1
            ? ""
            : "s"}
        </Text>
        <Text variant="muted">
          A proof must read state that is already ~10 blocks old, so the next
          private transaction cannot be built yet.
        </Text>
      </div>
    {/if}

    {#if $step}<Text variant="muted">{$step}</Text>{/if}
    {#if $error}<Text variant="muted">{$error}</Text>{/if}

    {#if $registered === false}
      <Button
        variant="secondary"
        title="Register now"
        loading={$busy}
        disabled={blocked}
        onclick={register}
      />
    {/if}
  </Card>

  <!-- Balances: one discovery call covers every token. -->
  <Card>
    <Text variant="subtitle">Private balances</Text>
    {#if $balances.length === 0}
      <Text variant="muted">No tokens.</Text>
    {:else}
      {#each $balances as b (b.token.address)}
        <div class="row">
          <span class="sym">{b.token.symbol}</span>
          <span class="val">{b.private.toFormatted(true)}</span>
          <span class="notes">
            {b.notes} note{b.notes === 1 ? "" : "s"}
          </span>
        </div>
      {/each}
      <Text variant="muted">
        Import more ERC20s from Balances — every token works in the same pool.
      </Text>
    {/if}
  </Card>

  <Card>
    <Select label="Token" options={tokenOptions} bind:value={symbol} />
  </Card>

  {#if token}
    <!-- Deposit is two transactions: a transparent approve, then the proof. -->
    <Card>
      <Text variant="subtitle">Deposit</Text>
      {#if $pendingDeposit}
        <Text variant="muted">
          Approved {$pendingDeposit.input}
          {$pendingDeposit.token.symbol}.
          {$waiting
            ? "Waiting for it to become provable…"
            : "Ready — press Deposit to prove and submit."}
        </Text>
        <Button
          title="Deposit"
          loading={$busy}
          disabled={blocked}
          onclick={finishDeposit}
        />
      {:else}
        <TextField
          label="Amount"
          placeholder="0.0"
          inputmode="decimal"
          bind:value={depositAmount}
        />
        <Text variant="muted">
          Sends an ERC20 approve first; the pool cannot pull funds without it.
        </Text>
        <Button
          title="Approve"
          loading={$busy}
          disabled={blocked || !depositAmount.trim()}
          onclick={() => token && deposit(token, depositAmount)}
        />
      {/if}
    </Card>

    <Card>
      <Text variant="subtitle">Private send</Text>
      <TextField
        label="Amount"
        placeholder="0.0"
        inputmode="decimal"
        bind:value={sendAmount}
      />
      <TextField
        label="Recipient address"
        placeholder="0x…"
        bind:value={sendTo}
        oninput={checkRecipient}
      />
      {#if toReady === false}
        <Text variant="muted">
          That account has not registered a viewing key, so it cannot receive a
          private transfer yet.
        </Text>
      {/if}
      <Button
        title="Send privately"
        loading={$busy}
        disabled={blocked || !sendAmount.trim() || toReady !== true}
        onclick={() => token && transfer(token, sendTo, sendAmount)}
      />
    </Card>

    <Card>
      <Text variant="subtitle">Withdraw</Text>
      <TextField
        label="Amount"
        placeholder="0.0"
        inputmode="decimal"
        bind:value={withdrawAmount}
      />
      <Text variant="muted">Withdraws to your own wallet address.</Text>
      <Button
        title="Withdraw"
        loading={$busy}
        disabled={blocked || !withdrawAmount.trim()}
        onclick={() => token && withdraw(token, withdrawAmount)}
      />
    </Card>
  {/if}
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-md);
  }
  .wait {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    padding: var(--sp-md);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: var(--sp-md);
  }
  .sym {
    flex: 0 0 64px;
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
  }
  .val {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
  }
  .notes {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
