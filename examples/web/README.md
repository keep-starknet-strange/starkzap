# Web Example

Browser-based playground for the SDK. Demonstrates three wallet connection strategies (Cartridge Controller, private key, Privy), account deployment, transfers, and sponsored (gasless) transactions on Starknet Sepolia.

## Prerequisites

- Node.js 18+
- The SDK built locally (this example references the SDK source via the `starkzap` alias in `vite.config.ts`)

## Quick Start

From the repository root:

```bash
cd examples/web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server hot-reloads both the example and the SDK source thanks to the path aliases configured in `vite.config.ts`.

## Project Structure

```
examples/web/
  index.html          UI layout, styles, and structure (single-page app, no framework)
  main.ts             All connection, deploy, transfer, and UI logic
  vite.config.ts      Vite config with path aliases pointing at the SDK source
  package.json        Scripts and dependencies (links SDK via file:../..)

examples/server/
  server.ts           Express backend for Privy wallet management and AVNU paymaster proxy
  .env.example        Template for required environment variables
  wallets.json        File-based wallet/user storage (auto-created at runtime)
  package.json        Server dependencies (@privy-io/node, express, cors, dotenv)
```

## Connection Methods

The example supports three independent wallet strategies. Each one initializes the SDK and produces a `WalletInterface` that exposes `execute`, `deploy`, `isDeployed`, `address`, and other standard methods.

### 1. Cartridge Controller

**How to use:** Click **Cartridge**. A popup window opens for Cartridge's session-based authentication (social login or WebAuthn). No server or extra setup is required.

**What happens under the hood:**

1. The SDK calls `sdk.onboard()` with `OnboardStrategy.Cartridge`.
2. Internally, a `SessionProvider` from `@cartridge/controller` is created with the configured session policies.
3. The Cartridge popup handles account creation/login and grants the app a scoped session.
4. Cartridge manages the account contract deployment and funding, so you don't need STRK balance to start.

**Session policies** are pre-configured in `main.ts` and define what the session is allowed to do:

```typescript
const DUMMY_POLICY = {
  target: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK token
  method: "transfer",
};
```

This grants the session permission to call `transfer` on the STRK contract. Transactions outside these policies will be rejected.

### 2. Private Key

**How to use:** Click **Private Key** to expand the form. Enter a hex private key (`0x...`) or click the dice button to generate a random Stark-curve key. Select an account preset, then click **Connect**.

**What happens under the hood:**

1. A `StarkSigner` is created from the private key.
2. The SDK calls `sdk.onboard()` with `OnboardStrategy.Signer` and the chosen `accountPreset`.
3. The deterministic account address is computed from the signer's public key and the preset's class hash + constructor calldata.
4. The wallet is ready to sign transactions locally.

**Account presets** determine which on-chain account contract is used:

| Preset         | Description                                           |
| -------------- | ----------------------------------------------------- |
| OpenZeppelin   | Standard OpenZeppelin account contract                |
| Argent         | Argent account contract                               |
| ArgentX v0.5.0 | ArgentX-specific version (also used by Privy wallets) |
| Braavos        | Braavos account contract                              |
| Devnet         | Devnet-compatible account (for local Starknet devnet) |

**New account workflow:**

1. After connecting, the address is computed but the contract is not yet deployed on-chain.
2. Copy the address using the clipboard button.
3. Fund it with STRK on Sepolia (via a faucet like [starknet-faucet.vercel.app](https://starknet-faucet.vercel.app) or from another wallet).
4. Click **Deploy Account** to submit the deploy transaction.
5. Once deployed, use **Test Transfer** or **Sponsored Tx** to verify the account works end-to-end.

### 3. Privy (Server-Managed Keys)

**How to use:** Click **Privy**, enter an email address, select an account preset, then click **Connect**. Requires the companion server to be running (see [Server Setup](#server-setup-privy--paymaster) below).

**What happens under the hood:**

1. The web app sends a health check to `http://localhost:3001/api/health`.
2. A POST to `/api/user/register` creates or retrieves a Privy Starknet wallet for the given email.
3. The server returns the wallet ID, public key, and address.
4. The SDK calls `sdk.onboard()` with `OnboardStrategy.Privy`, passing a `resolve` callback that returns the wallet ID, public key, and signing server URL.
5. A `PrivySigner` is created internally. All subsequent signing requests are sent to the server's `/api/wallet/sign` endpoint, which calls the Privy Node SDK to sign the hash remotely.
6. The account address is computed the same way as private key mode (public key + preset class hash).

This strategy keeps the private key entirely on Privy's infrastructure. The web app never has access to it. The same new-account workflow applies: fund the address, then deploy.

## Server Setup (Privy + Paymaster)

The `examples/server/` directory contains an Express server that provides two services:

1. **Privy wallet proxy** -- creates Starknet wallets via the Privy Node SDK, stores user-to-wallet mappings in a local JSON file, and signs transaction hashes on behalf of users.
2. **AVNU paymaster proxy** -- forwards paymaster JSON-RPC requests to AVNU's paymaster endpoint, injecting your API key so the client never exposes it.

### Environment Variables

```bash
cd examples/server
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable             | Required | Default                             | Description                                                                        |
| -------------------- | -------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `PRIVY_APP_ID`       | Yes      | --                                  | Your Privy application ID (from the [Privy dashboard](https://dashboard.privy.io)) |
| `PRIVY_APP_SECRET`   | Yes      | --                                  | Your Privy application secret                                                      |
| `AVNU_API_KEY`       | Yes      | --                                  | AVNU paymaster API key (enables sponsored/gasless mode)                            |
| `AVNU_PAYMASTER_URL` | No       | `https://sepolia.paymaster.avnu.fi` | Override the paymaster endpoint (e.g. for mainnet)                                 |

### Installing and Running

Install server dependencies:

```bash
cd examples/server
npm install
```

Then from the `examples/web/` directory, run everything together:

```bash
npm run dev:all
```

This uses `concurrently` to start the Vite dev server (port 5173) and the Express server (port 3001) in parallel.

Or run them separately:

```bash
# Terminal 1 -- Vite dev server (port 5173)
cd examples/web
npm run dev

# Terminal 2 -- Express server (port 3001)
cd examples/server
npx tsx server.ts
```

### Server Endpoints

The Express server (port 3001) exposes these routes:

| Endpoint                       | Method | Auth         | Description                                                                                                                                                        |
| ------------------------------ | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/health`                  | GET    | No           | Returns `{ status: "ok" }`. Used by the web app to check if the server is reachable before attempting Privy operations.                                            |
| `/api/wallet/starknet`         | POST   | Bearer token | Creates a new Starknet wallet via Privy or returns the existing one for the authenticated user. Returns `{ wallet: { id, address, publicKey }, accounts, isNew }`. |
| `/api/wallet/register-account` | POST   | Bearer token | Associates a computed account address with a preset for the user. Body: `{ preset, address, deployed? }`.                                                          |
| `/api/wallet/set-deployed`     | POST   | Bearer token | Updates the deployment status of a registered account. Body: `{ preset, deployed }`.                                                                               |
| `/api/wallet/sign`             | POST   | No           | Signs a transaction hash using a Privy wallet. Body: `{ walletId, hash }`. Returns `{ signature }`.                                                                |
| `/api/paymaster`               | POST   | No           | Proxies the request body to the AVNU paymaster URL, attaching the `x-paymaster-api-key` header. Returns the paymaster response as-is.                              |

Wallet data is persisted in `wallets.json` (auto-created). This is a simple file store for development -- use a real database in production.

## Wallet Actions

Once connected (via any strategy), the wallet panel appears with these actions:

| Action             | Button           | What it does                                                                                                                                            | When it can fail                                                                                               |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Check Status**   | `Check Status`   | Calls `wallet.isDeployed()` which queries the RPC node for the account's contract class. Updates the status badge to "Deployed" or "Not Deployed".      | RPC node is unreachable or rate-limited.                                                                       |
| **Deploy Account** | `Deploy Account` | Calls `wallet.deploy()` to submit a `DEPLOY_ACCOUNT` transaction. Waits for on-chain confirmation via `tx.wait()`.                                      | Account has no STRK balance to pay gas. Account is already deployed. The class hash is not declared on-chain.  |
| **Test Transfer**  | `Test Transfer`  | Executes a 0-STRK transfer to self (`wallet.execute()` with `transfer(self, 0)`). A safe, no-op transaction to verify end-to-end signing and execution. | Account is not deployed. Insufficient STRK for gas.                                                            |
| **Sponsored Tx**   | `Sponsored Tx`   | Same 0-STRK self-transfer, but with `{ feeMode: "sponsored" }`. Gas fees are paid by the AVNU paymaster instead of the account.                         | Server not running. `AVNU_API_KEY` not set or invalid. Paymaster doesn't support the account class or network. |
| **Copy Address**   | Clipboard icon   | Copies the full account address to clipboard.                                                                                                           | Clipboard API not available (non-HTTPS).                                                                       |
| **Disconnect**     | `Disconnect`     | Clears wallet state. For Cartridge wallets, also calls `disconnect()` to end the session.                                                               | --                                                                                                             |

The **Activity Log** at the bottom of the page shows timestamped events for every action: connection details, public keys, transaction hashes, explorer links, confirmation status, and errors.

## Configuration

### Network

The app connects to Starknet Sepolia by default. To change the network, edit the constants at the top of `main.ts`:

```typescript
const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9";

const sdk = new StarkSDK({
  rpcUrl: RPC_URL,
  chainId: ChainId.SEPOLIA,
});
```

For mainnet, change both `RPC_URL` and `ChainId.SEPOLIA` to `ChainId.MAINNET`, and set `AVNU_PAYMASTER_URL` in the server's `.env` to `https://mainnet.paymaster.avnu.fi`.

### Privy Server URL

The Privy server URL defaults to `http://localhost:3001`. Change it in `main.ts` if your server runs elsewhere:

```typescript
const PRIVY_SERVER_URL = "http://localhost:3001";
```

### Vite Path Aliases

`vite.config.ts` maps `starkzap` to the SDK source at `../../src/index.ts` and `@` to `../../src/`. This means:

- `import { StarkSDK } from "starkzap"` resolves to the local SDK source, not a published npm bundle.
- Changes to the SDK source are hot-reloaded automatically.
- The `optimizeDeps.exclude: ["starkzap"]` setting prevents Vite from pre-bundling the SDK.

## Scripts

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Start Vite dev server on port 5173                |
| `npm run dev:server` | Start Privy/paymaster Express server on port 3001 |
| `npm run dev:all`    | Start both concurrently (Vite + Express)          |
| `npm run build`      | Production build via Vite                         |
| `npm run preview`    | Preview the production build locally              |

## Troubleshooting

| Problem                                          | Cause                                                                | Fix                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Cartridge popup blocked                          | Browser popup blocker                                                | Look for a blocked-popup icon in the URL bar and allow it                     |
| Privy connection fails with "server not running" | Express server is not running on port 3001                           | Run `npm run dev:all` from `examples/web/`, or start the server separately    |
| Sponsored tx fails                               | `AVNU_API_KEY` missing or invalid                                    | Set it in `examples/server/.env` and restart the server                       |
| Sponsored tx fails with "paymaster error"        | Paymaster doesn't support the account class or network               | Try a different account preset, or check AVNU docs for supported contracts    |
| Deploy fails with "insufficient balance"         | Account address has no STRK                                          | Fund the address on Sepolia first (copy it with the clipboard button)         |
| Deploy fails with "already deployed"             | Account contract is already on-chain                                 | Click **Check Status** to confirm -- no action needed                         |
| "Class hash not declared" on deploy              | The account preset's class hash isn't declared on the target network | Use a different preset, or make sure you're on Sepolia (not mainnet/devnet)   |
| Private key "invalid" error                      | Key is not a valid hex string or exceeds the Stark curve order       | Generate a new key with the dice button                                       |
| Transfer fails after deploy                      | Transaction may still be pending                                     | Wait a few seconds and retry; check the activity log for the deploy tx status |
