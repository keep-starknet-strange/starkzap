/**
 * Lazy loader and module types for `@fatsolutions/tongo-sdk`.
 *
 * Internal on purpose, and kept out of `@/confidential`'s barrel. Both types
 * below name the optional peer, so a declaration file that references them has
 * to resolve `@fatsolutions/tongo-sdk` — which would make an optional
 * dependency mandatory for every consumer who imports anything from this
 * package. Keeping them here means nothing in the public declaration graph
 * names the peer.
 *
 * Mirrors `@/connect/ethersRuntime` and `@/utils/avnu`.
 */

export type TongoSdkModule = typeof import("@fatsolutions/tongo-sdk");

/** The underlying `Account` class instance from the Tongo SDK. */
export type TongoAccount = InstanceType<TongoSdkModule["Account"]>;

let cachedTongoSdk: TongoSdkModule | undefined;
let loadingTongoSdk: Promise<TongoSdkModule> | undefined;

/**
 * Lazily loads @fatsolutions/tongo-sdk and caches the module namespace object.
 *
 * The dependency is an optional peer dependency: it is only required when
 * Tongo confidential transfers are actually used. This is the single place
 * where the SDK's presence is checked at runtime.
 */
export async function loadTongoSdk(
  feature = "Tongo confidential transfers"
): Promise<TongoSdkModule> {
  if (cachedTongoSdk) {
    return cachedTongoSdk;
  }

  // NOTE: the import() must be wrapped in try/catch (not a .catch() chain):
  // webpack only downgrades an unresolvable dynamic import to a build warning
  // (with a runtime error) when the import() sits inside a try block. With a
  // .then()/.catch() chain instead, consumers without the optional peer
  // installed get a hard "Module not found" build error.
  loadingTongoSdk ??= (async () => {
    try {
      const module = await import("@fatsolutions/tongo-sdk");
      cachedTongoSdk = module as unknown as TongoSdkModule;
      return cachedTongoSdk;
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? ` Original error: ${error.message}`
          : "";
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency "@fatsolutions/tongo-sdk". Install it with: npm i @fatsolutions/tongo-sdk.${detail}`
      );
    } finally {
      loadingTongoSdk = undefined;
    }
  })();

  return await loadingTongoSdk;
}
