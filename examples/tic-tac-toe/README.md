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
cp env.example .env
```

Useful env vars:

- `EXPO_PUBLIC_STARKNET_NETWORK`: `SN_SEPOLIA` or `SN_MAIN`
- `EXPO_PUBLIC_CARTRIDGE_RPC`
- `EXPO_PUBLIC_CARTRIDGE_URL`
- `EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL` (default: `tictactoe://cartridge/callback`)

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

This app depends on `@starkzap/native` from `../../packages/native`. The `postinstall` script builds the SDK packages from repo root.

## Cartridge Native Module Setup

This app uses Cartridge native Controller module setup (not wasm) via `uniffi-bindgen-react-native`.

1. Clone `controller.c`:

```bash
git clone https://github.com/cartridge-gg/controller.c
```

2. Point this app to that local checkout:

```bash
export CONTROLLER_C_DIR=/absolute/path/to/controller.c
```

3. Build iOS binary using the official script and sync RN bindings:

```bash
cd examples/tic-tac-toe
npm run cartridge:setup:ios
```

This uses:

- `uniffi-bindgen-react-native` (`github:Larkooo/uniffi-bindgen-react-native#update-uniffi-0.30`)
- `controller.c/scripts/build_ios.sh`

If `uniffi-bindgen-react-native` is not found, run `npm install` in this workspace,
the script will also fall back to `npx` with:
`github:Larkooo/uniffi-bindgen-react-native#update-uniffi-0.30`.

If you still prefer global install, use cargo:

```bash
cargo install --git https://github.com/Larkooo/uniffi-bindgen-react-native --branch update-uniffi-0.30 uniffi-bindgen-react-native
```

If you get a Rust target error (for example `can't find crate for core`), install iOS targets once:

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
```

If `controller.c`'s pinned `stable` toolchain causes target-install issues on your machine, override the build toolchain:

```bash
export CONTROLLER_RUST_TOOLCHAIN=nightly-aarch64-apple-darwin
npm run cartridge:setup:ios
```

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

## Notes For Native Onboarding

- `@starkzap/native` is loaded lazily when connecting Cartridge (not at app bootstrap), which avoids early runtime crashes from transitive modules.
- Cartridge auth/session is handled by native Controller through `modules/controller/src`.
- Cartridge redirect URL is `EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL` (default: `tictactoe://cartridge/callback`).
- App scheme is `tictactoe`, so Cartridge redirect URL is `tictactoe://cartridge/callback`.
- Keep a single React Native version in the tree (this app is pinned to `react-native@0.81.5` to match Expo SDK 54).
- If Metro caches stale resolution after dependency changes, run:

```bash
npx expo start -c
```
