import Constants, { ExecutionEnvironment } from "expo-constants";

// Public env vars (Expo inlines EXPO_PUBLIC_* at build time).
export const PRIVY_SERVER_URL = process.env.EXPO_PUBLIC_PRIVY_SERVER_URL ?? "";
export const PAYMASTER_PROXY_URL =
  process.env.EXPO_PUBLIC_PAYMASTER_PROXY_URL ?? "";
export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";

// Privy needs native modules (not bundled in Expo Go), so its login flow only
// works in a dev/custom build. Use this to gate the Privy path.
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
