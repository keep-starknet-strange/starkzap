# Mobile example — Starknet wallet (Expo)

React Native + Expo app that demonstrates the StarkZap SDK on mobile: connect with **Privy** (social/login) or generate/import a **private key**, view balances, make transfers, and stake token.

## What this example does

- **Onboarding:** Sign in with Privy (email, Google, etc.) or generate/import a Starknet private key (Braavos, Ready, OpenZeppelin); choose Mainnet or Sepolia.
- **Paymaster:** Support AVNU Paymaster for gas less transactions.
- **Balances:** View STRK, USDC, WBTC (and network-specific tokens) with optional USD conversion.
- **Transfers:** Single and batch transfers with amount input and explorer links.
- **Staking:** Enter delegation pools, add to stake, claim rewards, exit (intent + complete).
- **UX:** Themed light/dark UI, transaction toasts with explorer links, copyable errors, logs FAB.

The app uses the parent SDK via `"x": "file:../.."` (or `starkzap` when published). See [StarkZap docs](https://docs.starknet.io/build/starkzap) for API details.

---

## Prerequisites

- Node.js 18+
- iOS simulator (Xcode) and/or Android emulator, or [Expo Go](https://expo.dev/go) on a device
- For **Privy login:** a [Privy](https://privy.io) app and (optional) a backend for server-side signing

---

## Configure environment (required for Privy)

**You must set up `.env` before running**, or the app will show a “Configuration required” screen.

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Edit `examples/mobile/.env` and set at least:

   | Variable | Required | Description |
   | -------- | -------- | ----------- |
   | `EXPO_PUBLIC_PRIVY_APP_ID` | Yes (for Privy) | From [Privy Dashboard](https://dashboard.privy.io) → your app → App ID |
   | `EXPO_PUBLIC_PRIVY_CLIENT_ID` | Optional | From Privy Dashboard → Clients, for embedded wallet |
   | `EXPO_PUBLIC_PRIVY_SERVER_URL` | Optional | Your backend URL for Privy server-side signing (e.g. `http://localhost:3001`) |
   | `EXPO_PUBLIC_PAYMASTER_PROXY_URL` | Optional | Paymaster proxy URL for gasless txs; defaults to `{PRIVY_SERVER_URL}/api/paymaster` if `PRIVY_SERVER_URL` is set |

Without `EXPO_PUBLIC_PRIVY_APP_ID`, the app still runs but **Privy login is disabled**; you can use the **private key** flow only. The app will show an on-screen message if env is missing.

**Privy Dashboard (Expo Go):** If you use Expo Go and see “Native app ID `host.exp.Exponent` has not been set as an allowed app identifier”, add it in [Privy Dashboard](https://dashboard.privy.io) → **Configuration → App settings → Clients** → **Allowed app identifiers** → add `host.exp.Exponent`.

**Privy OAuth (Google, Apple, etc.):** Enable the login methods you want in the Privy Dashboard under **Login methods**, and set [allowed URL schemes](https://docs.privy.io/basics/get-started/dashboard/app-clients#allowed-url-schemes) for OAuth redirects.

---

## How to run

This example lives inside the monorepo. Install from the **repo root** first, then the mobile app.

**From the monorepo root (e.g. `x` or `x-mobile-exampleUI`):**

```bash
# 1. Install root dependencies (optional: use --ignore-scripts if husky fails)
npm install

# 2. Install mobile example dependencies
cd examples/mobile
npm install

# 3. Start the app
npx expo start
```

Then open the app in the iOS simulator, Android emulator, or Expo Go (scan the QR code). If you didn’t configure `.env`, you’ll see the “Configuration required” screen with instructions.

**If you only have the `examples/mobile` folder** (e.g. copied out of the repo):

```bash
cd examples/mobile   # or your project root
npm install
npx expo start
```

The app depends on the `x` (StarkZap) package. When running from the full repo, it uses `"x": "file:../.."`. In a standalone copy you’d need to install `starkzap` from npm or link the SDK separately.

---

## Optional: Privy server (server-side signing)

For Privy wallet creation and signing via your backend (recommended for production), run the server example:

```bash
# From monorepo root
cd examples/server
cp .env.example .env
# Edit .env: set PRIVY_APP_ID, PRIVY_APP_SECRET, etc.
npm install
npm start
```

Then set `EXPO_PUBLIC_PRIVY_SERVER_URL` in `examples/mobile/.env` to that server URL (e.g. `http://localhost:3001` for local dev).

---

## Project structure

- `app/` — Expo Router screens: `index.tsx` (onboarding), `(tabs)/` (balances, transfers, staking), `logs` modal
- `components/` — Shared UI (e.g. `AmountInput`, `ValidatorCard`, `Toast`, `EnvConfigScreen`)
- `stores/` — Zustand: wallet (connection, network, deploy), balances, staking
- `constants/` — Theme, env validation
- `providers/` — Privy provider wrapper

---

## Learn more

- [StarkZap docs](https://docs.starknet.io/build/starkzap) — SDK overview, wallets, tokens, staking
- [Privy + Expo](https://docs.privy.io) — Privy setup and allowed identifiers
- [Expo](https://docs.expo.dev) — Running on simulator, device, and Expo Go
