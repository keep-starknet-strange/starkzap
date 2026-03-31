# Starkzap Mobile Example (Expo)

React Native + Expo app showing how to integrate `starkzap-native` in a mobile client.

## What this app demonstrates

- Configure Starknet network at runtime (Sepolia, Mainnet, or custom RPC).
- Connect with a local private key via `sdk.onboard({ strategy: OnboardStrategy.Signer })`.
- Connect with Privy via `sdk.onboard({ strategy: OnboardStrategy.Privy })`.
- Connect with Cartridge via `sdk.onboard({ strategy: OnboardStrategy.Cartridge, deploy: "never", feeMode: "sponsored", cartridge: { ... } })` when `EXPO_PUBLIC_CARTRIDGE_PRESET` is set (Expo `registerCartridgeTsAdapter` + `expo-web-browser` redirect flow; see `cartridge-setup.ts`).
- Check account deployment status and deploy when needed (deploy UI is hidden for Cartridge sessions; use private key or Privy to try deployment in this example).
- Read balances, send transfers, execute Ekubo swaps, use Vesu lending/vault flows, and use staking flows.
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
- `EXPO_PUBLIC_PRIVY_CLIENT_ID`: optional Privy client id for the Expo provider.
- `EXPO_PUBLIC_PAYMASTER_PROXY_URL`: optional paymaster proxy URL. If omitted, the example only auto-derives `${EXPO_PUBLIC_PRIVY_SERVER_URL}/api/paymaster` on Sepolia. Mainnet requires an explicit paymaster URL.

**Cartridge (optional)**

- `EXPO_PUBLIC_CARTRIDGE_PRESET`: **required** to show Cartridge login. Must be a valid Cartridge preset name for your chain (policies resolve from Cartridge).
- `EXPO_PUBLIC_CARTRIDGE_URL`: optional Cartridge web URL; defaults to `https://x.cartridge.gg` when omitted.
- `EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL`: optional OAuth redirect URL. If unset, the app uses `Linking.createURL("cartridge/callback")` (scheme from `app.json`, e.g. `mobile://...`). Any custom URL must be allowed in your Cartridge project settings.

While connected with Cartridge, **in-app network switching is disabled**; disconnect, pick the network on the home screen, then connect again.

## Install and run

From the monorepo root, install and build the SDK first. Then run the example:

```bash
# From repo root
npm install
npm run build
```

```bash
cd examples/mobile
npm install
npm run start
```

Platform shortcuts:

- `npm run ios`
- `npm run android`
- `npm run web`

Note: this example depends on the local native package via `"starkzap-native": "file:../../packages/native"`. The `postinstall` script builds core + native packages from repo root.

## SDK integration points in this app

- **Entry**: Expo's default `expo-router/entry` (see `package.json` `"main"`). There is no separate `entrypoint.js` in this example; the app boots through Expo Router.
- `metro.config.js`: `withStarkzap` from `starkzap-native/metro` plus minimal monorepo resolution and package-exports compatibility overrides.
- `cartridge-setup.ts`: one-time `registerCartridgeTsAdapter` with `expo-web-browser` auth session (imported from the wallet store so `WebBrowser.maybeCompleteAuthSession()` runs at startup).
- `stores/wallet.ts`: creates `StarkZap`, configures paymaster, and handles signer/Privy/Cartridge onboarding.
- `app/index.tsx`: connection screen and network setup flow.
- `app/(tabs)/vesu.tsx`: Vesu Lite-inspired market cards with live supply/borrow stats when available, plus vault deposit/withdraw, withdraw max, and borrow/repay health previews.
- `app/(tabs)/*`: balances, transfers, swap, and staking screens.

## Swap flow in this example

The Swap tab uses provider-based helpers:

- `provider.getQuote(params)` to fetch a quote
- `wallet.swap({ ...params, provider }, options?)` to execute the swap

To submit a swap, provide:

- Input token (`From`)
- Output token (`To`)
- Input amount (`Amount In`)

Notes:

- AVNU source: uses `GET /swap/v3/quotes` + `POST /swap/v3/build` from `https://starknet.api.avnu.fi`, then executes via `wallet.swap(...)`.
- Ekubo source: fetches quote from `https://prod-api-quoter.ekubo.org` and builds router calls (`transfer` + `swap/multihop` + `clear_minimum` + `clear`).
- Typing a valid `Amount In` now auto-fetches an estimated receive preview for the selected swap source.
- Swap backends are pluggable through a shared TypeScript contract (`SwapProvider`) from `starkzap`, with app-level extensions in `swaps/interface.ts`.
- Active integrations are registered in `swaps/index.ts` and rendered through one common UI.
- Token selection is sourced from preset token lists for the active network, with in-modal search.
- On Sepolia, the Swap tab defaults to `USDC.e` instead of `USDC` because `USDC` routes are often unavailable on Ekubo testnet.
- On low-liquidity pairs, the quote API can return an error such as `Insufficient liquidity in the routes ...`.

## DCA flow in this example

The same tab now includes a `DCA` mode for recurring buys:

- choose the recurring backend first (`AVNU` or `Ekubo`)
- `wallet.dca().previewCycle(...)` previews one cycle through the selected swap source (`AVNU` or `Ekubo`, depending on network support).
- `wallet.dca().create(...)` creates the recurring order through the selected native backend.
- `wallet.dca().getOrders(...)` refreshes recent orders for the selected backend on the connected wallet.
- `wallet.dca().cancel(...)` cancels an active order through that same backend.

Notes:

- The mobile wallet session registers both swap providers and DCA providers during onboarding, so the backend selector and preview selector only show integrations the connected wallet can actually use.
- The mobile example keeps DCA token choices curated and chain-specific instead of exposing the full swap token list.
- The cadence picker includes a `1h` option for quicker demos, plus `12h`, `Daily`, `3d`, and `Weekly`.
- `AVNU` creates discrete recurring orders.
- `Ekubo` creates a native continuous TWAMM order on supported chains, so listed orders show `Continuous` instead of a preset cadence.
- On Sepolia, the clearest Ekubo DCA demo pairs I could confirm from public quote routes are `ETH -> USDC.e` and `WBTC -> ETH`.
- Pull-to-refresh updates balances, and in `DCA` mode it also refreshes the recent order list.

## Backend for Privy and paymaster (optional but recommended)

This app expects the same backend contract as `examples/server`:

- `POST /api/wallet/starknet`
- `POST /api/wallet/sign`
- `POST /api/paymaster`

Run the backend separately in `examples/server` and point `EXPO_PUBLIC_PRIVY_SERVER_URL` to it.

## Troubleshooting

- Privy button disabled: `EXPO_PUBLIC_PRIVY_APP_ID` is missing.
- Privy login/signing errors: verify `EXPO_PUBLIC_PRIVY_SERVER_URL` and backend health.
- Cartridge login missing: set `EXPO_PUBLIC_CARTRIDGE_PRESET` and restart Metro. Preset/load errors surface in alerts and the logs panel.
- Cartridge redirect fails: ensure the redirect URL matches your app scheme (`mobile` in `app.json`) or set `EXPO_PUBLIC_CARTRIDGE_REDIRECT_URL` to an allowlisted URL.
- Sponsored toggle disabled: `EXPO_PUBLIC_PAYMASTER_PROXY_URL` is not configured, or you are on Mainnet without an explicit paymaster URL.
- Metro module resolution issues after dependency changes: run `npm run start -- --clear` (or `npx expo start -c`).
