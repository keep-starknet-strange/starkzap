<script lang="ts">
  import Text from "~/lib/ui/Text.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import Strk20Panel from "./strk20/Strk20Panel.svelte";
  import TongoPanel from "./TongoPanel.svelte";

  // Two independent protocols, not two implementations of one interface: STRK20
  // spends notes and needs a remote prover, Tongo keeps an encrypted balance and
  // proves locally. Nothing is shared between the panels but the token list.
  let protocol = $state("strk20");
</script>

<Text variant="title">Privacy</Text>
<Segmented
  options={[
    { label: "STRK20", value: "strk20" },
    { label: "Tongo", value: "tongo" },
  ]}
  bind:value={protocol}
/>

{#if protocol === "strk20"}
  <Strk20Panel />
{:else}
  <TongoPanel />
{/if}
