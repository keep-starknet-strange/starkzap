<script lang="ts">
  import Text from "~/lib/ui/Text.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import SwapPanel from "./SwapPanel.svelte";
  import DcaPanel from "~/features/dca/DcaPanel.svelte";

  let mode = $state("swap");
</script>

<Text variant="title">Swap</Text>
<Segmented
  options={[
    { label: "Swap", value: "swap" },
    { label: "DCA", value: "dca" },
  ]}
  bind:value={mode}
/>

{#if mode === "swap"}
  <SwapPanel />
{:else}
  <DcaPanel />
{/if}
