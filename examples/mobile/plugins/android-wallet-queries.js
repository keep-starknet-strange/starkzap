const {
  withAndroidManifest,
  createRunOncePlugin,
} = require("expo/config-plugins");

const queries = {
  package: [
    { $: { "android:name": "app.phantom" } },
    { $: { "android:name": "com.solflare.mobile" } },
  ],
};

const withWalletQueries = (config) => {
  return withAndroidManifest(config, (config) => {
    config.modResults.manifest = {
      ...config.modResults.manifest,
      queries,
    };
    return config;
  });
};

module.exports = createRunOncePlugin(
  withWalletQueries,
  "withWalletQueries",
  "1.0.0"
);
