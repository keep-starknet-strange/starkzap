type HyperlaneSdkModule = typeof import("@hyperlane-xyz/sdk");
type HyperlaneRegistryModule = typeof import("@hyperlane-xyz/registry");
type HyperlaneUtilsModule = typeof import("@hyperlane-xyz/utils");

export type HyperlaneRuntime = {
  sdk: HyperlaneSdkModule;
  registry: HyperlaneRegistryModule;
  utils: HyperlaneUtilsModule;
};

let cachedHyperlane: HyperlaneRuntime | undefined;
let loadingHyperlane: Promise<HyperlaneRuntime> | undefined;

/**
 * Lazily loads Hyperlane modules and caches them for subsequent calls.
 */
export async function loadHyperlane(
  feature: string
): Promise<HyperlaneRuntime> {
  if (cachedHyperlane) {
    return cachedHyperlane;
  }

  loadingHyperlane ??= Promise.all([
    import("@hyperlane-xyz/sdk"),
    import("@hyperlane-xyz/registry"),
    import("@hyperlane-xyz/utils"),
  ])
    .then(([sdk, registry, utils]) => {
      cachedHyperlane = { sdk, registry, utils };
      return cachedHyperlane;
    })
    .catch(() => {
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependencies "@hyperlane-xyz/sdk", "@hyperlane-xyz/registry", and "@hyperlane-xyz/utils". Install them with: npm i @hyperlane-xyz/sdk @hyperlane-xyz/registry @hyperlane-xyz/utils`
      );
    })
    .finally(() => {
      loadingHyperlane = undefined;
    });

  return await loadingHyperlane;
}
