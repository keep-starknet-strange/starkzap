export type PrivacySdkModule =
  typeof import("@starkware-libs/starknet-privacy-sdk");

let cachedPrivacySdk: PrivacySdkModule | undefined;
let loadingPrivacySdk: Promise<PrivacySdkModule> | undefined;

/**
 * Lazily loads @starkware-libs/starknet-privacy-sdk and caches the module
 * namespace object.
 *
 * The dependency is an optional peer dependency. It is only required when
 * privacy pool operations are actually used. This is the single place where
 * the SDK's presence is checked at runtime.
 *
 * The SDK is published to GitHub Packages rather than npmjs and needs Node 24
 * for the WebCrypto APIs its OHTTP layer relies on, so both are called out in
 * the failure message.
 *
 * Near-identical to the Tongo loader in `@/confidential/tongo`, and deliberately
 * not shared with it. The specifier has to be a literal in both places: `typeof
 * import("…")` needs one to produce the module type, and bundlers — Metro in
 * particular — resolve `import()` statically, so a specifier passed in as an
 * argument defeats the optional-peer resolution this indirection exists for. What
 * is left to share is the message formatting, which is not worth splitting a
 * loader across two files for.
 */
export async function loadPrivacySdk(
  feature = "Privacy pool transfers"
): Promise<PrivacySdkModule> {
  if (cachedPrivacySdk) {
    return cachedPrivacySdk;
  }

  loadingPrivacySdk ??= (async () => {
    try {
      const module = await import("@starkware-libs/starknet-privacy-sdk");
      cachedPrivacySdk = module as unknown as PrivacySdkModule;
      return cachedPrivacySdk;
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? ` Original error: ${error.message}`
          : "";
      throw new Error(
        `[starkzap] ${feature} requires optional peer dependency ` +
          '"@starkware-libs/starknet-privacy-sdk". It is published to GitHub ' +
          "Packages rather than npmjs, so installing it needs the scope pointed " +
          "at `https://npm.pkg.github.com` and a token with `read:packages`. " +
          `Requires Node >= 24.${detail}`
      );
    } finally {
      loadingPrivacySdk = undefined;
    }
  })();

  return await loadingPrivacySdk;
}
