const {
  withAndroidManifest,
  createRunOncePlugin,
} = require("expo/config-plugins");

// Android 11+ package visibility: allow deep-linking into the Solana wallets.
const queries = {
  package: [
    { $: { "android:name": "app.phantom" } },
    { $: { "android:name": "com.solflare.mobile" } },
  ],
};

const withWalletQueries = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults.manifest = { ...cfg.modResults.manifest, queries };
    return cfg;
  });

module.exports = createRunOncePlugin(
  withWalletQueries,
  "withWalletQueries",
  "1.0.0"
);
