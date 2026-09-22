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

  // NOTE: the import() must be wrapped in try/catch (not a .catch() chain):
  // webpack only downgrades an unresolvable dynamic import to a build warning
  // (with a runtime error) when the import() sits inside a try block — the
  // same pattern the Cartridge loader in src/wallet/cartridge.ts relies on.
  // With a .then()/.catch() chain instead, consumers without the optional
  // peer installed get a hard "Module not found" build error.
  loadingHyperlane ??= (async () => {
    try {
      // Awaited sequentially (not Promise.all) so each import() is directly
      // awaited inside the try block — the shape esbuild also recognizes as
      // handled, deferring a missing module to run-time instead of failing
      // the consumer's bundle at build-time.
      const sdk = await import("@hyperlane-xyz/sdk");
      const registry = await import("@hyperlane-xyz/registry");
      const utils = await import("@hyperlane-xyz/utils");
      cachedHyperlane = { sdk, registry, utils };
      return cachedHyperlane;
    } catch {
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependencies "@hyperlane-xyz/sdk", "@hyperlane-xyz/registry", and "@hyperlane-xyz/utils". Install them with: npm i @hyperlane-xyz/sdk @hyperlane-xyz/registry @hyperlane-xyz/utils`
      );
    } finally {
      loadingHyperlane = undefined;
    }
  })();

  return await loadingHyperlane;
}
