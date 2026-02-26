# Starkzap Mobile Example (Expo)

React Native + Expo app showing how to integrate `starkzap` in a mobile client.

## What this app demonstrates

- Configure Starknet network at runtime (Sepolia, Mainnet, or custom RPC).
- Connect with a local private key via `sdk.onboard({ strategy: OnboardStrategy.Signer })`.
- Connect with Privy via `sdk.onboard({ strategy: OnboardStrategy.Privy })`.
- Check account deployment status and deploy when needed.
- Read balances, send transfers, and use staking flows.
- Use sponsored transactions when a paymaster proxy is configured.

## Prerequisites

- Node.js 18+
- iOS Simulator / Android Emulator (or Expo Go / physical device)
- Optional for Privy + sponsored mode: backend from `examples/server`

## Environment setup

```bash
cd examples/mobile
cp .env.example .env
```

Set these values in `.env`:

- `EXPO_PUBLIC_PRIVY_APP_ID`: Privy app id. If empty, Privy flow is disabled.
- `EXPO_PUBLIC_PRIVY_SERVER_URL`: backend URL used by the app for Privy wallet/sign endpoints.
-  optional
- `EXPO_PUBLIC_PRIVY_CLIENT_ID`: Privy client id for Expo provider.
- `EXPO_PUBLIC_PAYMASTER_PROXY_URL`: paymaster proxy URL. If omitted, defaults to `${EXPO_PUBLIC_PRIVY_SERVER_URL}/api/paymaster`.

## Install and run

```bash
cd examples/mobile
npm install
npm run start
```

Platform shortcuts:

- `npm run ios`
- `npm run android`
- `npm run web`

Note: this example depends on the local SDK via `"starkzap": "file:../.."`. The `postinstall` script builds the SDK from repo root.

## SDK integration points in this app

- `entrypoint.js`: loads required polyfills before Expo startup.
- `metro.config.js`: resolves `starkzap` to local SDK source for development.
- `stores/wallet.ts`: creates `StarkSDK`, configures paymaster, and handles signer/Privy onboarding.
- `app/index.tsx`: connection screen and network setup flow.
- `app/(tabs)/*`: balances, transfers, and staking screens.

## Backend for Privy and paymaster (optional but recommended)

This app expects the same backend contract as `examples/server`:

- `POST /api/wallet/starknet`
- `POST /api/wallet/sign`
- `POST /api/paymaster`

Run the backend separately in `examples/server` and point `EXPO_PUBLIC_PRIVY_SERVER_URL` to it.

## Troubleshooting

- Privy button disabled: `EXPO_PUBLIC_PRIVY_APP_ID` is missing.
- Privy login/signing errors: verify `EXPO_PUBLIC_PRIVY_SERVER_URL` and backend health.
- Sponsored toggle disabled: `EXPO_PUBLIC_PAYMASTER_PROXY_URL` (or derived server URL) is not configured.
- Metro module resolution issues after dependency changes: run `npm run start -- --clear` (or `npx expo start -c`).
