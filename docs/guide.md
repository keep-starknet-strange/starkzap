# x SDK Developer Guide

A full developer guide for integrating Starknet wallets with `x` across web, Node.js, and mobile runtimes.

## Who This Guide Is For

Use this guide if you are:

- Integrating Starknet account abstraction into an app.
- Building wallet flows with private key, Privy, or Cartridge.
- Shipping token operations, staking, and sponsored transactions.
- Maintaining a codebase that uses `x` and needs predictable patterns.

## What You Get in This SDK

- `StarkSDK` orchestration layer for provider/network/config.
- Wallet abstraction (`WalletInterface`) with interchangeable backends.
- Signer support for:
  - Local Stark private key (`StarkSigner`)
  - Privy-managed keys (`PrivySigner`)
  - Cartridge Controller (`connectCartridge`)
- ERC20 helpers for balances and transfers.
- Staking flows for pool membership and rewards.
- Transaction tools (`Tx`, `TxBuilder`) for batching and tracking.
- Strongly typed primitives (`Address`, `Amount`, `ChainId`).

## Installation

```bash
npm install x
```

## Runtime Compatibility

- Node.js: supported.
- Browser: supported.
- React Native: supported.

## Quick Start (Recommended: Onboarding API)

```ts
import {
  StarkSDK,
  OnboardStrategy,
  accountPresets,
  Amount,
  fromAddress,
  sepoliaTokens,
} from "x";

const sdk = new StarkSDK({ network: "sepolia" });

// Example: user is already logged in with Privy in your app
const accessToken = await privy.getAccessToken();

const onboard = await sdk.onboard({
  strategy: OnboardStrategy.Privy,
  accountPreset: accountPresets.argentXV050,
  privy: {
    // resolve() returns signer context for the current authenticated user
    resolve: async () => {
      // 1) Fetch or create this user's Privy Starknet wallet from backend
      const walletRes = await fetch(
        "https://your-api.example/wallet/starknet",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const { wallet } = await walletRes.json();

      // 2) Return wallet context + backend signing endpoint
      return {
        walletId: wallet.id,
        publicKey: wallet.publicKey,
        serverUrl: "https://your-api.example/wallet/sign",
      };
    },
  },
  feeMode: "sponsored",
  deploy: "if_needed",
});
const wallet = onboard.wallet;

const token = sepoliaTokens.STRK;
const balance = await wallet.balanceOf(token);
console.log(balance.toFormatted(true));

const tx = await wallet.transfer(token, [
  { to: fromAddress("0xRECIPIENT"), amount: Amount.parse("1", token) },
]);

await tx.wait();
```

`resolve()` is expected to return:

- `walletId`: the Privy wallet id for the logged-in user
- `publicKey`: the Starknet public key for that wallet
- `serverUrl` OR `rawSign`: how signatures are produced
- optional `headers` and `buildBody` for auth/challenge-capable signing endpoints

## Onboarding API

`sdk.onboard(...)` is the simplest integration entrypoint and handles:

- strategy selection
- signer construction
- wallet connection
- optional `ensureReady` lifecycle

Supported strategies:

- `OnboardStrategy.Privy`
- `OnboardStrategy.Signer`
- `OnboardStrategy.Cartridge`

### Signer strategy

```ts
import { StarkSigner, OnboardStrategy } from "x";

const onboard = await sdk.onboard({
  strategy: OnboardStrategy.Signer,
  account: { signer: new StarkSigner("0xPRIVATE_KEY") },
  accountPreset: "openzeppelin",
  deploy: "if_needed",
});
```

### Cartridge strategy

```ts
import { OnboardStrategy } from "x";

const onboard = await sdk.onboard({
  strategy: OnboardStrategy.Cartridge,
  cartridge: {
    policies: [{ target: "0xCONTRACT", method: "transfer" }],
  },
});
```

## Configuration Model

`StarkSDK` accepts either:

- `network` preset (`"mainnet"`, `"sepolia"`, `"devnet"`), or
- explicit `rpcUrl` + `chainId`.

Optional features:

- `paymaster` for sponsored fees.
- `explorer` for transaction URL generation.
- `staking.contract` for staking methods.

```ts
import { StarkSDK, ChainId, fromAddress } from "x";

const sdk = new StarkSDK({
  rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
  chainId: ChainId.MAINNET,
  paymaster: { nodeUrl: "https://your-paymaster.example" },
  staking: {
    contract: fromAddress(
      "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
    ),
  },
});
```

## Wallet Connection Patterns

### 1) Local private key (server or trusted environment)

```ts
import { StarkSigner, OpenZeppelinPreset } from "x";

const wallet = await sdk.connectWallet({
  account: {
    signer: new StarkSigner(process.env.STARK_PRIVATE_KEY!),
    accountClass: OpenZeppelinPreset,
  },
});
```

### 2) Privy signer (recommended for many consumer apps)

```ts
import { PrivySigner, ArgentXV050Preset } from "x";

const signer = new PrivySigner({
  walletId: "privy-wallet-id",
  publicKey: "0xPUBLIC_KEY",
  serverUrl: "https://your-api.example/wallet/sign",
});

const wallet = await sdk.connectWallet({
  account: { signer, accountClass: ArgentXV050Preset },
});
```

### 3) Cartridge controller

`connectCartridge()` is web-only.

```ts
const wallet = await sdk.connectCartridge({
  policies: [{ target: "0xCONTRACT", method: "transfer" }],
});
```

## Account Lifecycle

Before user actions, call:

```ts
await wallet.ensureReady({ deploy: "if_needed" });
```

Deployment policy options:

- `"never"`: fail if undeployed.
- `"if_needed"`: deploy undeployed accounts.
- `"always"`: force deployment flow.

## Transaction Execution

### Direct execute

```ts
const tx = await wallet.execute(calls, { feeMode: "user_pays" });
await tx.wait();
```

### Preflight simulation

```ts
const result = await wallet.preflight({ calls });
if (!result.ok) {
  console.error(result.reason);
}
```

### Batch with `TxBuilder`

```ts
const tx = await wallet
  .tx()
  .transfer(mainnetTokens.STRK, {
    to: fromAddress("0xRECIPIENT"),
    amount: Amount.parse("1", mainnetTokens.STRK),
  })
  .send();
```

## ERC20 Guide

### Query balances

```ts
const strk = mainnetTokens.STRK;
const balance = await wallet.balanceOf(strk);
```

### Send one-to-many transfers

```ts
await wallet.transfer(mainnetTokens.STRK, [
  { to: fromAddress("0xAAA"), amount: Amount.parse("1", mainnetTokens.STRK) },
  { to: fromAddress("0xBBB"), amount: Amount.parse("2", mainnetTokens.STRK) },
]);
```

## Staking Guide

Staking requires `staking.contract` in SDK config.

### Discover pools for a validator

```ts
const pools = await sdk.getStakerPools(fromAddress("0xVALIDATOR"));
```

### Enter pool / add stake

```ts
await wallet.enterPool(poolAddress, Amount.parse("10", token));
await wallet.addToPool(poolAddress, Amount.parse("5", token));
```

### Exit flow

```ts
await wallet.exitPoolIntent(poolAddress, Amount.parse("2", token));
// after cooldown window
await wallet.exitPool(poolAddress);
```

### Rewards + position

```ts
await wallet.claimPoolRewards(poolAddress);
const position = await wallet.getPoolPosition(poolAddress);
```

## Type Primitives

### Address safety

```ts
import { fromAddress } from "x";

const addr = fromAddress("0x1234");
```

### Amount arithmetic

```ts
const a = Amount.parse("1.5", mainnetTokens.STRK);
const b = Amount.parse("0.25", mainnetTokens.STRK);
const c = a.add(b);
console.log(c.toFormatted(true));
```

### Chain IDs

```ts
import { ChainId } from "x";

if (ChainId.MAINNET.isMainnet()) {
  // ...
}
```

## Production Guidance

- Prefer signer separation by trust boundary:
  - server-only keys on backend,
  - Privy for managed end-user keys,
  - Cartridge for delegated UX.
- Always preflight non-trivial batches before submit.
- Standardize fee behavior (`user_pays` vs `sponsored`) per flow.
- Avoid hardcoding token addresses; use chain-specific presets where possible.
- Keep staking contract config chain-aware.

## Troubleshooting

### "staking.contract is not defined"

Add `staking.contract` to `StarkSDK` config before calling staking APIs.

### Transaction submits but URL is missing

Configure `explorer` (`provider` or `baseUrl`) in SDK config.

### React Native random values/text encoding issues

Install runtime polyfills in your app entrypoint (for example `react-native-get-random-values`) and ensure your runtime provides `TextEncoder`/`TextDecoder`.

## Examples in this Repository

- Web app integration: `examples/web`
- Backend signer flow: `examples/server`
- React Native integration: `examples/mobile`

## Documentation Pipeline

This repository includes an npm-based docs pipeline:

```bash
npm run docs:api
npm run docs:export
```

Outputs:

- `docs/api/` generated API reference (TypeDoc markdown)
- `docs/export/DEVELOPER_GUIDE.md`
- `docs/export/api/`
- `docs/export/x-docs.zip`

Use `docs/export` as the distributable documentation bundle.
