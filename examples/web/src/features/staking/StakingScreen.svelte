<script lang="ts">
  import Text from "~/lib/ui/Text.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import DelegatePanel from "./DelegatePanel.svelte";
  import LstPanel from "./LstPanel.svelte";

  let mode = $state("delegate");
</script>

<Text variant="title">Staking</Text>
<Segmented
  options={[
    { label: "Delegate", value: "delegate" },
    { label: "Liquid", value: "liquid" },
  ]}
  bind:value={mode}
/>

{#if mode === "delegate"}
  <DelegatePanel />
{:else}
  <LstPanel />
{/if}
