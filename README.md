# Starkzap — Bitcoin in your app in minutes

Bring Bitcoin, stablecoins, and DeFi to any web or mobile app via Starknet in minutes. One TypeScript SDK: wallets, tokens, staking, and gasless transactions — with a clean API and great UX. Starknet’s account abstraction lets you hide blockchain complexity (no seed phrases, optional gasless flows). Works on **web** (React, Vite, etc.), **iOS & Android** (React Native, Expo), and **Node.js** backends. Built on [starknet.js](https://github.com/starknet-io/starknet.js).

**Full documentation:** [docs.starknet.io/build/starkzap](https://docs.starknet.io/build/starkzap/overview)

---

## Installation

```bash
npm install starkzap
```

Dependency and optional peers:

- [`starknet`](https://www.npmjs.com/package/starknet) (v9+) — Starknet.js core (installed with `starkzap`)
- [`@cartridge/controller`](https://www.npmjs.com/package/@cartridge/controller) — optional peer, only needed for Cartridge support

For specific integrations, you may need:

- **Privy** (server): `npm install @privy-io/node` — see [Privy integration](https://docs.starknet.io/build/starkzap/integrations/privy)
- **Privy** (React Native / Expo): see the [Privy docs](https://docs.privy.io) for the Expo SDK
- **AVNU Paymaster**: no extra package; configure a paymaster URL — see [Paymasters](https://docs.starknet.io/build/starkzap/paymasters) and [AVNU integration](https://docs.starknet.io/build/starkzap/integrations/avnu-paymaster)

---

## Quick Start

```typescript
import {
  StarkSDK,
  StarkSigner,
  Amount,
  fromAddress,
  sepoliaTokens,
} from "starkzap";

const STRK = sepoliaTokens.STRK;
const sdk = new StarkSDK({ network: "sepolia" });

const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner("0xYOUR_PRIVATE_KEY") },
});

await wallet.ensureReady({ deploy: "if_needed" });

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
npm test                    # unit tests (some flows require reachable RPC/devnet)
npm run test:integration    # requires starknet-devnet
npm run lint
npm run prettier
npm run build
```

Token and validator presets can be regenerated with `npm run generate:tokens`, `npm run generate:tokens:sepolia`, `npm run generate:validators`, and `npm run generate:validators:sepolia`.

---

## License

[MIT](LICENSE) — 0xLucqs
