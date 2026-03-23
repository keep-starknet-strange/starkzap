# Starkzap — Bitcoin in your app in minutes

<img width="1200" height="675" alt="Twitter post - 3 (1)" src="https://github.com/user-attachments/assets/66df6de6-b0b8-4c83-8589-aeb53927451e" />

</div>

---

Bring Bitcoin, stablecoins, and DeFi to any web or mobile app via Starknet in minutes. One TypeScript SDK: wallets, tokens, staking, and gasless transactions — with a clean API and great UX. Starknet’s account abstraction lets you hide blockchain complexity (no seed phrases, optional gasless flows). Works on **web** (React, Vite, etc.), **iOS & Android** (React Native, Expo), and **Node.js** backends.

**Full documentation:** [docs.starknet.io/build/starkzap](https://docs.starknet.io/build/starkzap/overview)

**Curated list of projects using Starkzap:** [awesome-starkzap](https://github.com/keep-starknet-strange/awesome-starkzap)

**Starkzap Debugging Group:** [telegram chat](https://t.me/+I-Vt-_DcvecwNmY0)

---

## Installation

Install Starkzap using npm or yarn:

```bash
npm install starkzap
```

or

```bash
yarn add starkzap
```

Building for React Native/Expo? Use [React Native Integration](/build/starkzap/react-native) and install `@starkzap/native` instead of using `starkzap` directly in your mobile app.

### Dependencies

The SDK depends on:

- [`starknet`](https://www.npmjs.com/package/starknet) (v9+) - Starknet.js core library

This will be installed automatically when you install `starkzap`.

#### Peer dependencies by feature

All peer dependencies are **optional** to keep the package lean. Install only what you need:

| Feature                                                          | Included in                        | Peer Dependencies                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Ethereum bridging** (deposit / withdraw to Ethereum)           | `starkzap`,<br/>`@starkzap/native` | `ethers@^6`                                                                                               |
| **Solana bridging** (deposit / withdraw to Solana via Hyperlane) | `starkzap`,<br/>`@starkzap/native` | `@solana/web3.js@^1`, `@hyperlane-xyz/sdk@^14`, `@hyperlane-xyz/registry@^19`, `@hyperlane-xyz/utils@^14` |
| **Cartridge Controller wallet**                                  | `starkzap`,<br/>`@starkzap/native` | `@cartridge/controller@^0.13`                                                                             |
| **Confidential transfers** (Tongo)                               | `starkzap`,<br/>`@starkzap/native` | `@fatsolutions/tongo-sdk@^1`                                                                              |
| **React Native / Expo**                                          | `@starkzap/native`                 | `react-native-get-random-values@^1`, `fast-text-encoding@^1`, `@ethersproject/shims@^5`, `buffer@^6`      |

```bash
# Ethereum bridging
npm install ethers

# Solana bridging
npm install @solana/web3.js @hyperlane-xyz/sdk @hyperlane-xyz/registry @hyperlane-xyz/utils

# Cartridge Controller (only for Web)
npm install @cartridge/controller

# Confidential transfers
npm install @fatsolutions/tongo-sdk

# React Native / Expo (use @starkzap/native instead of starkzap)
npm install @starkzap/native react-native-get-random-values fast-text-encoding @ethersproject/shims buffer
```

---

## Quick Start

```typescript
import {
  StarkZap,
  StarkSigner,
  OnboardStrategy,
  Amount,
  fromAddress,
  sepoliaTokens,
} from "starkzap";

const sdk = new StarkZap({ network: "sepolia" });

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

---

## Examples

The repo includes web, mobile, and server examples in `examples/`. See the [Examples docs](https://docs.starknet.io/build/starkzap/examples) for run instructions and details.

---

## Contributors✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/0xlucqs"><img src="https://avatars.githubusercontent.com/u/70894690?v=4?s=100" width="100px;" alt="0xLucqs"/><br /><sub><b>0xLucas</b></sub></a><br /><a href="https://github.com/keep-starknet-strange/starkzap/commits?author=0xLucqs" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/micbakos"><img src="https://avatars.githubusercontent.com/u/6217006?v=4?s=100" width="100px;" alt="micbakos"/><br /><sub><b>micbakos</b></sub></a><br /><a href="https://github.com/keep-starknet-strange/starkzap/commits?author=micbakos" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/0xsisyfos"><img src="https://avatars.githubusercontent.com/u/107465625?v=4?s=100" width="100px;" alt="0xsisyfos"/><br /><sub><b>0xsisyfos</b></sub></a><br /><a href="https://github.com/keep-starknet-strange/starkzap/commits?author=0xsisyfos" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Akashneelesh"><img src="https://avatars.githubusercontent.com/u/66639153?v=4?s=100" width="100px;" alt="Akashneelesh"/><br /><sub><b>Akashneelesh</b></sub></a><br /><a href="https://github.com/Akashneelesh/awesome-starkzap/commits?author=Akashneelesh" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/abdelhamidbakhta"><img src="https://avatars.githubusercontent.com/u/45264458?v=4?s=100" width="100px;" alt="Abdel @ StarkWare "/><br /><sub><b>Abdel @ StarkWare </b></sub></a><br /><a href="https://github.com/keep-starknet-strange/alexandria/commits?author=abdelhamidbakhta" title="Code">💻</a></td>
  </tbody>
  <tfoot>
    <tr>
      <td align="center" size="13px" colspan="7">
        <img src="https://raw.githubusercontent.com/all-contributors/all-contributors-cli/1b8533af435da9854653492b1327a23a4dbd0a10/assets/logo-small.svg">
          <a href="https://all-contributors.js.org/docs/en/bot/usage">Add your contributions</a>
        </img>
      </td>
    </tr>
  </tfoot>
</table>


<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

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

## License

[MIT](LICENSE) — 0xLucqs
