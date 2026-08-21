<script lang="ts">
  import Card from "~/lib/ui/Card.svelte";
  import Text from "~/lib/ui/Text.svelte";
  import Button from "~/lib/ui/Button.svelte";
  import Select from "~/lib/ui/Select.svelte";
  import TextField from "~/lib/ui/TextField.svelte";
  import { tokens } from "~/lib/stores/tokens";
  import { walletState } from "~/lib/stores/wallet";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import {
    approveMode,
    balances,
    busy,
    cancelPending,
    client,
    confirmPending,
    connect,
    connecting,
    deposit,
    error,
    feeLabel,
    gasNote,
    pending,
    recipientReady,
    refresh,
    registered,
    simulateTransfer,
    simulateWithdraw,
    step,
    transfer,
    unavailableReason,
    waitingBlocks,
    withdraw,
  } from "./store";

  const reason = $derived(unavailableReason($walletState.walletType));

  let symbol = $state("");
  const token = $derived($tokens.find((t) => t.symbol === symbol));

  let depositAmount = $state("");
  let sendAmount = $state("");
  let sendTo = $state("");
  let withdrawAmount = $state("");
  // Deliberately empty: self-withdrawing undoes the pool, so it has to be chosen.
  let withdrawTo = $state("");

  // Whether the recipient has registered a viewing key. The SDK cannot build a
  // transfer to an account without one, so this is checked before offering it.
  let toReady = $state<boolean | null>(null);
  async function checkRecipient() {
    toReady = sendTo.trim() ? await recipientReady(sendTo) : null;
  }

  const tokenOptions = $derived([
    { label: "Select a token", value: "" },
    ...$tokens.map((t) => ({ label: t.symbol, value: t.symbol })),
  ]);

  // Only one operation at a time. The block wait now happens *inside* send(),
  // reported through `waitingBlocks`, rather than gating the buttons up front.
  // is already ~10 blocks old.
  const blocked = $derived($busy);
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
          : "Not registered yet — your first deposit registers you. Registering on its own is not possible: the pool fee comes from your private balance, and you have none yet."}
    </Text>

    {#if $waitingBlocks !== null}
      <div class="wait">
        <Text variant="label">
          Waiting {$waitingBlocks} block{$waitingBlocks === 1 ? "" : "s"}
        </Text>
        <Text variant="muted">
          A proof must read state that is already ~10 blocks old, so this
          transaction cannot be proven yet.
        </Text>
      </div>
    {/if}

    {#if $feeLabel}
      <Text variant="muted">
        Pool fee: {$feeLabel} — withdrawn from your private balance on every
        send, not paid from your account. Quoted per pool, so it does not vary
        with what the transaction does.
      </Text>
      {#if $gasNote}
        <Text variant="muted">{$gasNote}</Text>
      {/if}
    {/if}

    {#if $step}<Text variant="muted">{$step}</Text>{/if}
    {#if $error}<Text variant="muted">{$error}</Text>{/if}

  </Card>

  <!--
    Warnings `simulate` raised, shown before anything has been proven or paid
    for. Confirming submits exactly what was simulated.
  -->
  {#if $pending}
    <Card>
      <Text variant="subtitle">{$pending.label}: simulated</Text>
      {#if $pending.warnings.length === 0}
        <Text variant="body">
          No warnings. Nothing about this transaction links your private and
          public activity.
        </Text>
      {:else}
        {#each $pending.warnings as warning, i (`${warning.code}-${i}`)}
          <Text variant="body">{warning.message}</Text>
        {/each}
      {/if}
      <Text variant="muted">
        Run against a mock prover, so nothing has been paid for yet. Confirming
        quotes the fee again, proves the transaction and submits it. Nothing is
        refused on your behalf — whether this is acceptable is your call.
      </Text>
      <div class="head">
        <Button
          title={`Confirm ${$pending.label.toLowerCase()}`}
          loading={$busy}
          disabled={$busy}
          onclick={confirmPending}
        />
        <Button
          variant="secondary"
          title="Cancel"
          disabled={$busy}
          onclick={cancelPending}
        />
      </div>
    </Card>
  {/if}

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
    <!-- The pool pulls public funds, so the approve is transparent either way.
         The switch only decides whether it is its own transaction or rides in
         the paymaster's bundle. -->
    <Card>
      <Text variant="subtitle">Deposit</Text>
      <TextField
        label="Amount"
        placeholder="0.0"
        inputmode="decimal"
        bind:value={depositAmount}
      />
      <Text variant="muted">Approve</Text>
      <Segmented
        options={[
          { label: "Separate tx", value: "separate" },
          { label: "In paymaster bundle", value: "bundled" },
        ]}
        bind:value={$approveMode}
      />
      <Text variant="muted">
        {$approveMode === "separate"
          ? "Two transactions: you sign and pay for the approve, then the relayer submits the private deposit."
          : "One transaction: the approve is relayed through your account's execute_from_outside alongside the pool action, so there is nothing separate to sign or pay for. Needs an account that supports SNIP-9."}
      </Text>
      <Button
        title="Deposit"
        loading={$busy}
        disabled={blocked || !depositAmount.trim()}
        onclick={() =>
          token &&
          deposit(token, depositAmount).then((ok) => {
            if (ok) depositAmount = "";
          })}
      />
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
      <div class="head">
        <Button
          variant="secondary"
          title="Simulate"
          disabled={blocked || !sendAmount.trim() || toReady !== true}
          onclick={() => token && simulateTransfer(token, sendTo, sendAmount)}
        />
        <Button
          title="Send privately"
          loading={$busy}
          disabled={blocked || !sendAmount.trim() || toReady !== true}
          onclick={() => token && transfer(token, sendTo, sendAmount)}
        />
      </div>
    </Card>

    <Card>
      <Text variant="subtitle">Withdraw</Text>
      <TextField
        label="Amount"
        placeholder="0.0"
        inputmode="decimal"
        bind:value={withdrawAmount}
      />
      <TextField
        label="Recipient address"
        placeholder="0x…"
        bind:value={withdrawTo}
      />
      <Text variant="muted">
        Deposits and withdrawals are public; only what happens between them is
        private. Withdrawing to the address you deposited from puts both ends on
        the same address, which is enough to link them — so a fresh address is
        what preserves the gap.
      </Text>
      <Button
        variant="secondary"
        title="Use my own address (links the two ends)"
        onclick={() => (withdrawTo = $walletState.address ?? "")}
      />
      <div class="head">
        <Button
          variant="secondary"
          title="Simulate"
          disabled={blocked || !withdrawAmount.trim() || !withdrawTo.trim()}
          onclick={() =>
            token && simulateWithdraw(token, withdrawTo, withdrawAmount)}
        />
        <Button
          title="Withdraw"
          loading={$busy}
          disabled={blocked || !withdrawAmount.trim() || !withdrawTo.trim()}
          onclick={() => token && withdraw(token, withdrawTo, withdrawAmount)}
        />
      </div>
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
