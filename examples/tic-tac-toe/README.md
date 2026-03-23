# Starkzap Tic-Tac-Toe (React Native / Expo)

React Native Expo example app for Starknet tic-tac-toe in this monorepo.

## Prerequisites

- Node.js 20.19+ (or 22.12+)
- npm 9+
- iOS Simulator or Android Emulator (or Expo Go on a device)

## Setup

This app is configured to run with defaults:

- Public tic-tac-toe contract address is already set in code/env template.
- Default network is Sepolia.
- Default Cartridge RPC is `https://api.cartridge.gg/x/starknet/sepolia`.

Optional override file:

```bash
cd examples/tic-tac-toe
cp .env.example .env
```

Useful env vars:

- `EXPO_PUBLIC_STARKNET_NETWORK`: `SN_SEPOLIA` or `SN_MAIN`
- `EXPO_PUBLIC_CARTRIDGE_RPC`
- `EXPO_PUBLIC_CARTRIDGE_URL`
- `EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL` (optional override)

## Install

From repo root (recommended for workspace install):

```bash
npm install
```

Or from this app directory:

```bash
cd examples/tic-tac-toe
npm install
```

This app depends on `starkzap-native` from `../../packages/native`. The `postinstall` script builds the SDK packages from repo root.

## Cartridge Session Adapter

This app uses the TypeScript Cartridge session adapter from `starkzap-native`.
No local Rust, UniFFI binding generation, or XCFramework build step is required for the session flow.

## Run

```bash
cd examples/tic-tac-toe
npm run start
```

If dependencies changed (for example `starknet` or `react-native` version bumps), re-run `npm install` before starting Expo.

Platform shortcuts:

- `npm run ios`
- `npm run android`
- `npm run web`

## Notes For Cartridge Onboarding

- `starkzap-native` is loaded lazily when connecting Cartridge (not at app bootstrap), which avoids early runtime crashes from transitive modules.
- Cartridge auth/session is handled by the TS session adapter in `app/context/StarknetConnector.tsx`, registered via `registerCartridgeTsAdapter(...)`.
- The example uses callback-first auth (`openAuthSessionAsync`) and falls back to browser + polling only if a callback URI is unavailable.
- Redirect URL is taken from `EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL` when set, otherwise generated via Expo Linking (`Linking.createURL("cartridge/callback")`).
- Keep a single React Native version in the tree (this app is pinned to `react-native@0.81.5` to match Expo SDK 54).
- If Metro caches stale resolution after dependency changes, run:

```bash
npx expo start -c
```
