// Extends the static app.json. Expo loads .env before evaluating this file, so
// non-EXPO_PUBLIC_ vars (which are NOT inlined into the app bundle) are readable
// here at build time. We surface the dev auto-login values via `extra` so app
// code can read them through expo-constants.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    devPrivateKey: process.env.EXPO_PRIVATE_KEY,
    devAccountPreset: process.env.EXPO_ACCOUNT_PRESET,
    devNetwork: process.env.EXPO_NETWORK,
  },
});
