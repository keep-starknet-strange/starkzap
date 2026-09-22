export type PrivacySdkModule =
  typeof import("@starkware-libs/starknet-privacy-sdk");

let cachedPrivacySdk: PrivacySdkModule | undefined;
let loadingPrivacySdk: Promise<PrivacySdkModule> | undefined;

/**
 * Load @starkware-libs/starknet-privacy-sdk on first use and cache it.
 *
 * The SDK is an optional peer dependency. This is the one place that checks
 * for it at runtime.
 *
 * The SDK is published to GitHub Packages, not npmjs, and needs Node 24. The
 * error message says so.
 *
 * Almost the same as the Tongo loader, on purpose. The import specifier must
 * be a literal, because bundlers such as Metro resolve `import()` statically.
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
