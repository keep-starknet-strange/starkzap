<script lang="ts">
  import Text from "~/lib/ui/Text.svelte";
  import Segmented from "~/lib/ui/Segmented.svelte";
  import EarnPanel from "./EarnPanel.svelte";
  import BorrowPanel from "./BorrowPanel.svelte";

  let mode = $state("earn");
</script>

<Text variant="title">Lending</Text>
<Segmented
  options={[
    { label: "Earn", value: "earn" },
    { label: "Borrow", value: "borrow" },
  ]}
  bind:value={mode}
/>

{#if mode === "earn"}
  <EarnPanel />
{:else}
  <BorrowPanel />
{/if}
