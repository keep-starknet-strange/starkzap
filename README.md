# Starkzap — Bitcoin in your app in minutes

# Starkzap - Bitcoin in your app in minutes

<img width="1200" height="675" alt="Twitter post - 3 (1)" src="https://github.com/user-attachments/assets/66df6de6-b0b8-4c83-8589-aeb53927451e" />

</div>

---

Bring Bitcoin, stablecoins, and DeFi to any web or mobile app via Starknet in minutes. One TypeScript SDK: wallets, tokens, staking, and gasless transactions — with a clean API and great UX. Starknet’s account abstraction lets you hide blockchain complexity (no seed phrases, optional gasless flows). Works on **web** (React, Vite, etc.), **iOS & Android** (React Native, Expo), and **Node.js** backends.

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Network Presets](#network-presets)
  - [Custom RPC](#custom-rpc)
  - [Paymaster (Sponsored Transactions)](#paymaster-sponsored-transactions)
  - [Explorer](#explorer)
  - [Staking](#staking-configuration)
- [Connecting a Wallet](#connecting-a-wallet)
  - [With a Private Key (StarkSigner)](#with-a-private-key-starksigner)
  - [With Privy (Server-Side Key Management)](#with-privy-server-side-key-management)
  - [With Cartridge Controller](#with-cartridge-controller)
  - [Custom Signer](#custom-signer)
- [Account Presets](#account-presets)
- [Wallet Lifecycle](#wallet-lifecycle)
  - [Deployment](#deployment)
  - [Ensure Ready](#ensure-ready)
- [Executing Transactions](#executing-transactions)
  - [Raw Contract Calls](#raw-contract-calls)
  - [Sponsored (Gasless) Transactions](#sponsored-gasless-transactions)
- [Transaction Tracking](#transaction-tracking)
- [ERC20 Tokens](#erc20-tokens)
  - [Token Presets](#token-presets)
  - [Checking Balances](#checking-balances)
  - [Transferring Tokens](#transferring-tokens)
- [Working with Amounts](#working-with-amounts)
  - [Creating Amounts](#creating-amounts)
  - [Converting and Displaying](#converting-and-displaying)
  - [Arithmetic](#arithmetic)
  - [Comparisons](#comparisons)
- [Staking & Delegation Pools](#staking--delegation-pools)
  - [Discovering Validators and Pools](#discovering-validators-and-pools)
  - [Entering a Pool](#entering-a-pool)
  - [Adding to an Existing Stake](#adding-to-an-existing-stake)
  - [Claiming Rewards](#claiming-rewards)
  - [Exiting a Pool (Two-Step)](#exiting-a-pool-two-step)
  - [Querying Position](#querying-position)
- [Transaction Builder](#transaction-builder)
  - [Basic Usage](#basic-usage)
  - [Mixing Operations](#mixing-operations)
  - [Preflight Simulation](#preflight-simulation)
  - [Fee Estimation](#fee-estimation)
- [Addresses](#addresses)
- [Chain IDs](#chain-ids)
- [React Native Setup](#react-native-setup)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [License](#license)

---

## Installation

```bash
npm install @starkware-ecosystem/starkzap
```

Peer dependencies (installed automatically with `starkzap`):

- [`starknet`](https://www.npmjs.com/package/starknet) (v9+) — Starknet.js core (installed with `@starkware-ecosystem/starkzap`)
- [`@cartridge/controller`](https://www.npmjs.com/package/@cartridge/controller) — optional peer, only needed for Cartridge support

For specific integrations, you may need:

- **Privy** (server): `npm install @privy-io/node` — see [Privy integration](https://docs.starknet.io/build/starkzap/integrations/privy)
- **Privy** (React Native / Expo): see the [Privy docs](https://docs.privy.io) for the Expo SDK
- **AVNU Paymaster**: no extra package; configure a paymaster URL — see [Paymasters](https://docs.starknet.io/build/starkzap/paymasters) and [AVNU integration](https://docs.starknet.io/build/starkzap/integrations/avnu-paymaster)

The package is published on npm as [`@starkware-ecosystem/starkzap`](https://www.npmjs.com/package/@starkware-ecosystem/starkzap); use `npm install @starkware-ecosystem/starkzap` and `from "@starkware-ecosystem/starkzap"` when not developing from this repo.

---

## Quick Start

```typescript
import {
  StarkSDK,
  StarkSigner,
  OnboardStrategy,
  Amount,
  fromAddress,
  sepoliaTokens,
} from "@starkware-ecosystem/starkzap";

const sdk = new StarkSDK({ network: "sepolia" });

const { wallet } = await sdk.onboard({
  strategy: OnboardStrategy.Signer,
  account: { signer: new StarkSigner("0xYOUR_PRIVATE_KEY") },
  deploy: "if_needed",
});

const STRK = sepoliaTokens.STRK;
const balance = await wallet.balanceOf(STRK);
console.log(balance.toFormatted()); // "150.25 STRK"

const tx = await wallet.transfer(STRK, [
  { to: fromAddress("0xRECIPIENT"), amount: Amount.parse("10", STRK) },
]);
await tx.wait();
```

For onboarding flows (Privy, Cartridge, etc.) and more examples, see the [Quick Start guide](https://docs.starknet.io/build/starkzap/quick-start).

---

## Documentation

All guides and API reference live on the Starknet docs site. We recommend starting with [Quick Start](https://docs.starknet.io/build/starkzap/quick-start).

- [Overview](https://docs.starknet.io/build/starkzap/overview)
- [Installation](https://docs.starknet.io/build/starkzap/installation)
- [Quick Start](https://docs.starknet.io/build/starkzap/quick-start)
- [Configuration](https://docs.starknet.io/build/starkzap/configuration)
- [Paymasters](https://docs.starknet.io/build/starkzap/paymasters)
- [Connecting Wallets](https://docs.starknet.io/build/starkzap/connecting-wallets)
- [Transactions](https://docs.starknet.io/build/starkzap/transactions)
- [ERC20 Tokens](https://docs.starknet.io/build/starkzap/erc20)
- [Staking](https://docs.starknet.io/build/starkzap/staking)
- [Transaction Builder](https://docs.starknet.io/build/starkzap/tx-builder)
- [Integrations](https://docs.starknet.io/build/starkzap/integrations/avnu-paymaster) — AVNU Paymaster, Privy, Cartridge
- [Examples](https://docs.starknet.io/build/starkzap/examples)
- [API Reference](https://docs.starknet.io/build/starkzap/api-reference)
- [Glossary](https://docs.starknet.io/build/starkzap/glossary) · [Troubleshooting](https://docs.starknet.io/build/starkzap/troubleshooting)

---

## Examples

The repo includes web, mobile, and server examples in `examples/`. See the [Examples docs](https://docs.starknet.io/build/starkzap/examples) for run instructions and details.

---

## Contributing

```bash
npm install
npm run typecheck
npm test
npm run test:integration   # requires starknet-devnet
npm run lint
npm run prettier
npm run build
```

Token and validator presets can be regenerated with `npm run generate:tokens`, `npm run generate:tokens:sepolia`, `npm run generate:validators`, and `npm run generate:validators:sepolia`.

---

## Contributors

Thanks to everyone who contributes to this project!

<!--GAMFC--><!--GAMFC-END-->

Made with [github-action-contributors](https://github.com/jaywcjlove/github-action-contributors).

---

## License

[MIT](LICENSE) — 0xLucqs
