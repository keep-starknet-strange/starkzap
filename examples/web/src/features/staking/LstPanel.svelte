<script lang="ts">
  import { onMount } from "svelte";
  import Text from "~/lib/ui/Text.svelte";
  import LstAssetCard from "./LstAssetCard.svelte";
  import { assets, load } from "./lst-store";

  onMount(load);
</script>

{#if $assets.length === 0}
  <Text variant="muted">Liquid staking is not available on this network.</Text>
{:else}
  {#each $assets as asset (asset)}
    <LstAssetCard {asset} />
  {/each}
{/if}
