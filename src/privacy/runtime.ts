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
        `[starkzap] ${feature} requires optional peer dependency "@starkware-libs/starknet-privacy-sdk". ` +
          "It is published to GitHub Packages, `https://github.com/starkware-libs/starknet-privacy/pkgs/npm/starknet-privacy-sdk`" +
          "and requires authentication `read:packages`." +
          `Requires Node >= 24.${detail}`
      );
    } finally {
      loadingPrivacySdk = undefined;
    }
  })();

  return await loadingPrivacySdk;
}
