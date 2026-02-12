# x — Starknet Wallet SDK

A TypeScript SDK for easy Starknet wallet integration. Supports multiple signer backends, ERC20 token operations, staking/delegation pools, sponsored (gasless) transactions, and transaction batching — all with a clean, fluent API.

Built on top of [starknet.js](https://github.com/starknet-io/starknet.js). Works in **Node.js**, **browsers**, and **React Native**.

## Developer Docs Export

The repository includes a full developer guide plus generated API reference that can be exported with npm:

```bash
npm run docs:api
npm run docs:export
```

Exported bundle:

- `docs/export/DEVELOPER_GUIDE.md`
- `docs/export/api/`
- `docs/export/x-docs.zip`

## Table of Contents

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
- [License](#license)

---

## Installation

```bash
npm install x
```

The SDK has two dependencies:

- [`starknet`](https://www.npmjs.com/package/starknet) (v9+) — Starknet.js core library
- [`@cartridge/controller`](https://www.npmjs.com/package/@cartridge/controller) — Cartridge wallet integration

---

## Quick Start

```typescript
import { StarkSDK, StarkSigner, Amount, fromAddress, mainnetTokens } from "x";

const STRK = mainnetTokens.STRK;

// 1. Initialize the SDK
const sdk = new StarkSDK({ network: "mainnet" });

// 2. Connect a wallet
const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner("0xYOUR_PRIVATE_KEY") },
});

// 3. Ensure the account is deployed
await wallet.ensureReady({ deploy: "if_needed" });

// 4. Check a token balance
const balance = await wallet.balanceOf(STRK);
console.log(balance.toFormatted()); // "150.25 STRK"

// 5. Transfer tokens
const tx = await wallet.transfer(STRK, [
  { to: fromAddress("0xRECIPIENT"), amount: Amount.parse("10", STRK) },
]);
console.log(tx.explorerUrl); // https://voyager.online/tx/0x...
await tx.wait();
```

### Onboarding API (Recommended for App Integrations)

Use `sdk.onboard(...)` to centralize strategy selection, signer setup, and account readiness in one call:

```typescript
import { StarkSDK, OnboardStrategy, accountPresets } from "x";

const sdk = new StarkSDK({ network: "sepolia" });

// Example: your app already authenticated the user with Privy
const accessToken = await privy.getAccessToken();

const onboard = await sdk.onboard({
  strategy: OnboardStrategy.Privy,
  accountPreset: accountPresets.argentXV050,
  privy: {
    // resolve() must return wallet context for the CURRENT authenticated user
    resolve: async () => {
      // 1) Ask your backend for this user's Privy Starknet wallet
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

      // 2) Return wallet context + signing endpoint
      // signer endpoint expects { walletId, hash } and returns { signature }
      return {
        walletId: wallet.id,
        publicKey: wallet.publicKey,
        serverUrl: "https://your-api.example/wallet/sign",
      };
    },
  },
  deploy: "if_needed",
});

const wallet = onboard.wallet;
```

`resolve()` is called at onboarding time and should return:

- `walletId`: Privy wallet identifier for the logged-in user
- `publicKey`: Stark public key for that wallet
- `serverUrl` OR `rawSign`: how the SDK should request signatures

---

## Configuration

### Network Presets

The simplest way to configure the SDK. Presets provide an RPC URL, chain ID, and block explorer URL.

```typescript
import { StarkSDK } from "x";

// Mainnet
const sdk = new StarkSDK({ network: "mainnet" });

// Sepolia testnet
const sdk = new StarkSDK({ network: "sepolia" });

// Local devnet (starknet-devnet-rs)
const sdk = new StarkSDK({ network: "devnet" });
```

Available presets:

| Preset    | Chain ID     | RPC                                           | Explorer                         |
| --------- | ------------ | --------------------------------------------- | -------------------------------- |
| `mainnet` | `SN_MAIN`    | `https://api.cartridge.gg/x/starknet/mainnet` | `https://voyager.online`         |
| `sepolia` | `SN_SEPOLIA` | `https://api.cartridge.gg/x/starknet/sepolia` | `https://sepolia.voyager.online` |
| `devnet`  | `SN_SEPOLIA` | `http://localhost:5050`                       | —                                |

You can also pass a custom `NetworkPreset` object:

```typescript
import { StarkSDK, networks } from "x";

const sdk = new StarkSDK({ network: networks.mainnet });
```

### Custom RPC

If you run your own node or use a different RPC provider:

```typescript
import { StarkSDK, ChainId } from "x";

const sdk = new StarkSDK({
  rpcUrl: "https://starknet-mainnet.infura.io/v3/YOUR_KEY",
  chainId: ChainId.MAINNET,
});
```

> `rpcUrl` and `chainId` override values from `network` if both are provided.

### Paymaster (Sponsored Transactions)

Configure a paymaster to enable gasless transactions for your users:

```typescript
const sdk = new StarkSDK({
  network: "mainnet",
  paymaster: { nodeUrl: "https://your-paymaster-endpoint.com" },
});
```

When a paymaster is configured, wallets can execute transactions with `feeMode: "sponsored"` — the paymaster covers gas fees on behalf of the user.

### Explorer

Control how block explorer URLs are generated for transactions:

```typescript
// Use a specific provider
const sdk = new StarkSDK({
  network: "mainnet",
  explorer: { provider: "starkscan" }, // "voyager" (default) or "starkscan"
});

// Use a custom explorer
const sdk = new StarkSDK({
  network: "mainnet",
  explorer: { baseUrl: "https://my-explorer.example.com" },
});
```

### Staking Configuration

Enable staking functionality by providing the core staking contract address:

```typescript
import { StarkSDK, fromAddress } from "x";

const sdk = new StarkSDK({
  network: "mainnet",
  staking: {
    contract: fromAddress(
      "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1"
    ),
  },
});
```

> Staking methods (`wallet.enterPool()`, `sdk.stakingTokens()`, etc.) throw if `staking` is not configured.

---

## Connecting a Wallet

### With a Private Key (StarkSigner)

The simplest approach — sign transactions locally using a Stark curve private key.

```typescript
import { StarkSDK, StarkSigner, OpenZeppelinPreset } from "x";

const sdk = new StarkSDK({ network: "sepolia" });
const signer = new StarkSigner("0xYOUR_PRIVATE_KEY");

// Default account type: OpenZeppelin
const wallet = await sdk.connectWallet({
  account: { signer },
});

// Or specify an account preset
const wallet = await sdk.connectWallet({
  account: { signer, accountClass: ArgentPreset },
});
```

### With Privy (Server-Side Key Management)

[Privy](https://privy.io) manages private keys securely on their infrastructure. The signing happens through your backend.

**Option A: Provide your backend URL (recommended for mobile/web clients)**

```typescript
import { StarkSDK, PrivySigner, ArgentXV050Preset } from "x";

const signer = new PrivySigner({
  walletId: "wallet-id-from-privy",
  publicKey: "0xPUBLIC_KEY_FROM_PRIVY",
  serverUrl: "https://your-backend.com/api/wallet/sign",
});

const wallet = await sdk.connectWallet({
  account: { signer, accountClass: ArgentXV050Preset },
});
```

Your backend endpoint receives `{ walletId, hash }` and must return `{ signature }`.

**Option B: Custom signing function (for server-side Node.js)**

```typescript
import { PrivySigner } from "x";

const signer = new PrivySigner({
  walletId: "wallet-id",
  publicKey: "0xPUBLIC_KEY",
  rawSign: async (walletId, messageHash) => {
    const response = await privyClient.wallets().rawSign(walletId, {
      params: { hash: messageHash },
    });
    return response.signature;
  },
});
```

### With Cartridge Controller

[Cartridge](https://cartridge.gg) provides social login and passkey authentication. Opens a popup for user authentication.

```typescript
import { StarkSDK } from "x";

const sdk = new StarkSDK({ network: "mainnet" });

const wallet = await sdk.connectCartridge({
  policies: [
    { target: "0xTOKEN_CONTRACT", method: "transfer" },
    { target: "0xPOOL_CONTRACT", method: "enter_delegation_pool" },
  ],
});

// Use just like any other wallet
const tx = await wallet.execute([...]);

// Access Cartridge-specific features
const controller = wallet.getController();
controller.openProfile();
```

### Custom Signer

Implement `SignerInterface` to integrate any key management solution (hardware wallets, MPC, HSMs, etc.):

```typescript
import type { SignerInterface } from "x";
import type { Signature } from "starknet";

class MySigner implements SignerInterface {
  async getPubKey(): Promise<string> {
    return "0xMY_PUBLIC_KEY";
  }

  async signRaw(hash: string): Promise<Signature> {
    // Sign the hash using your key management solution
    // Return [r, s] tuple
    return ["0x...", "0x..."];
  }
}

const wallet = await sdk.connectWallet({
  account: { signer: new MySigner() },
});
```

---

## Account Presets

Account presets define the smart contract class used for the wallet's account contract. Each preset specifies a class hash and how to build the constructor calldata from a public key.

```typescript
import {
  OpenZeppelinPreset, // Default — OpenZeppelin account
  ArgentPreset, // Argent v0.4.0
  ArgentXV050Preset, // Argent v0.5.0 (used by Privy)
  BraavosPreset, // Braavos v1.2.0
  DevnetPreset, // Local devnet accounts
} from "x";

// Use when connecting a wallet
const wallet = await sdk.connectWallet({
  account: {
    signer: new StarkSigner(privateKey),
    accountClass: ArgentPreset,
  },
});
```

**Custom account class:**

```typescript
import type { AccountClassConfig } from "x";
import { CallData } from "starknet";

const MyAccountPreset: AccountClassConfig = {
  classHash: "0xYOUR_CLASS_HASH",
  buildConstructorCalldata: (publicKey) => {
    return CallData.compile({ owner: publicKey });
  },
  // Optional: custom salt derivation (default uses publicKey)
  getSalt: (publicKey) => publicKey,
};
```

---

## Wallet Lifecycle

### Deployment

Starknet accounts are smart contracts that need to be deployed before they can execute transactions. The SDK handles this automatically.

```typescript
// Check if deployed
const deployed = await wallet.isDeployed();

// Deploy explicitly
if (!deployed) {
  const tx = await wallet.deploy();
  await tx.wait();
}

// Deploy with sponsored fees (gasless)
const tx = await wallet.deploy({ feeMode: "sponsored" });
await tx.wait();
```

> For sponsored wallets, `execute()` automatically deploys the account in the same transaction if needed — no separate deploy step required.

### Ensure Ready

A convenience method that checks deployment and optionally deploys:

```typescript
// Deploy if needed (default behavior)
await wallet.ensureReady();

// Explicit options
await wallet.ensureReady({
  deploy: "if_needed", // "never" | "if_needed" | "always"
  feeMode: "sponsored",
  onProgress: (event) => {
    console.log(event.step); // "CONNECTED" → "CHECK_DEPLOYED" → "DEPLOYING" → "READY"
  },
});
```

---

## Executing Transactions

### Raw Contract Calls

Use `wallet.execute()` for arbitrary contract calls:

```typescript
import type { Call } from "starknet";

const call: Call = {
  contractAddress: "0xCONTRACT_ADDRESS",
  entrypoint: "transfer",
  calldata: ["0xRECIPIENT", "1000000", "0"],
};

const tx = await wallet.execute([call]);
await tx.wait();
```

Multiple calls execute atomically in a single transaction:

```typescript
const tx = await wallet.execute([approveCall, swapCall, transferCall]);
await tx.wait();
```

### Sponsored (Gasless) Transactions

If the SDK is configured with a paymaster, pass `feeMode: "sponsored"`:

```typescript
// Per-transaction sponsorship
const tx = await wallet.execute([call], { feeMode: "sponsored" });

// Or set as default when connecting
const wallet = await sdk.connectWallet({
  account: { signer },
  feeMode: "sponsored",
});

// Now all transactions are sponsored by default
const tx = await wallet.execute([call]); // sponsored automatically
```

---

## Transaction Tracking

Every `execute()`, `deploy()`, or `transfer()` call returns a `Tx` object:

```typescript
const tx = await wallet.execute(calls);

// Transaction hash
console.log(tx.hash); // "0x..."

// Block explorer link
console.log(tx.explorerUrl); // "https://voyager.online/tx/0x..."

// Wait for confirmation (L2 acceptance)
await tx.wait();

// Wait for L1 finality
await tx.wait({
  successStates: [TransactionFinalityStatus.ACCEPTED_ON_L1],
});

// Get full receipt
const receipt = await tx.receipt();
console.log(receipt.actual_fee);

// Watch status changes in real-time
const unsubscribe = tx.watch(({ finality, execution }) => {
  console.log(`Status: ${finality} (${execution})`);
  // "RECEIVED" → "ACCEPTED_ON_L2" → "ACCEPTED_ON_L1"
});

// Stop watching early if needed
unsubscribe();
```

---

## ERC20 Tokens

### Token Presets

The SDK ships with pre-configured token definitions for mainnet and Sepolia:

```typescript
import { mainnetTokens, sepoliaTokens } from "x";

// Access specific tokens
const STRK = mainnetTokens.STRK;
const USDC = mainnetTokens.USDC;
const ETH = mainnetTokens.ETH;

// Token shape
interface Token {
  name: string; // "Starknet Token"
  address: Address; // "0x04718f5a0..."
  decimals: number; // 18
  symbol: string; // "STRK"
  metadata?: { logoUrl?: URL };
}

// Get tokens for a specific network
function getTokens(chainId: ChainId): Record<string, Token> {
  return chainId.isMainnet() ? mainnetTokens : sepoliaTokens;
}
```

Get tokens for the current network automatically:

```typescript
import { getPresets } from "x";

const tokens = getPresets(wallet.getChainId()); // Record<string, Token>
```

Resolve unknown tokens from on-chain contract addresses:

```typescript
import { getTokensFromAddresses } from "x";

const tokens = await getTokensFromAddresses(
  [fromAddress("0xTOKEN_CONTRACT")],
  provider
);
```

### Checking Balances

```typescript
const balance = await wallet.balanceOf(STRK);

console.log(balance.toUnit()); // "150.25"
console.log(balance.toFormatted()); // "150.25 STRK"
console.log(balance.toFormatted(true)); // "150.25 STRK" (compressed, max 4 decimals)
console.log(balance.toBase()); // 150250000000000000000n (raw)
console.log(balance.isZero()); // false
```

### Transferring Tokens

**Single transfer:**

```typescript
const tx = await wallet.transfer(USDC, [
  { to: fromAddress("0xRECIPIENT"), amount: Amount.parse("100", USDC) },
]);
await tx.wait();
```

**Batch transfer (multiple recipients in one transaction):**

```typescript
const tx = await wallet.transfer(USDC, [
  { to: fromAddress("0xALICE"), amount: Amount.parse("50", USDC) },
  { to: fromAddress("0xBOB"), amount: Amount.parse("25", USDC) },
  { to: fromAddress("0xCHARLIE"), amount: Amount.parse("10", USDC) },
]);
await tx.wait();
```

**With sponsored fees:**

```typescript
const tx = await wallet.transfer(
  USDC,
  [{ to: recipient, amount: Amount.parse("100", USDC) }],
  { feeMode: "sponsored" }
);
```

---

## Working with Amounts

The `Amount` class provides precision-safe handling of token amounts, preventing the common errors that occur when converting between human-readable values and raw blockchain values.

### Creating Amounts

```typescript
import { Amount } from "x";

// From human-readable values (what users type)
const amount = Amount.parse("1.5", STRK); // 1.5 STRK
const amount = Amount.parse("100", USDC); // 100 USDC
const amount = Amount.parse("0.001", 18, "ETH"); // With explicit decimals

// From raw blockchain values (from contract calls, balance queries)
const amount = Amount.fromRaw(1500000000000000000n, STRK); // 1.5 STRK
const amount = Amount.fromRaw(100000000n, 6, "USDC"); // 100 USDC
const amount = Amount.fromRaw(balance, STRK); // From balance query
```

### Converting and Displaying

```typescript
const amount = Amount.parse("1,500.50", 18, "ETH");

amount.toUnit(); // "1500.5"            — human-readable string
amount.toBase(); // 1500500000...0n     — raw bigint for contracts
amount.toFormatted(); // "1,500.5 ETH"       — locale-formatted with symbol
amount.toFormatted(true); // "1,500.5 ETH"       — compressed (max 4 decimals)

amount.getDecimals(); // 18
amount.getSymbol(); // "ETH"
```

### Arithmetic

All arithmetic operations return new `Amount` instances (immutable):

```typescript
const a = Amount.parse("10", STRK);
const b = Amount.parse("3", STRK);

a.add(b).toUnit(); // "13"
a.subtract(b).toUnit(); // "7"
a.multiply(2).toUnit(); // "20"
a.multiply("0.5").toUnit(); // "5"
a.divide(4).toUnit(); // "2.5"
```

> Arithmetic between incompatible amounts (different decimals or symbols) throws an error.

### Comparisons

```typescript
const a = Amount.parse("10", STRK);
const b = Amount.parse("5", STRK);

a.eq(b); // false — equal
a.gt(b); // true  — greater than
a.gte(b); // true  — greater than or equal
a.lt(b); // false — less than
a.lte(b); // false — less than or equal
a.isZero(); // false
a.isPositive(); // true
```

> Comparisons between incompatible amounts return `false` (never throw).

---

## Staking & Delegation Pools

The SDK supports Starknet's native staking protocol. Validators run pools where delegators can stake tokens and earn rewards.

> Requires `staking` config — see [Staking Configuration](#staking-configuration).

### Discovering Validators and Pools

```typescript
import { mainnetValidators, sepoliaValidators } from "x";

// Use built-in validator presets
for (const validator of Object.values(mainnetValidators)) {
  console.log(`${validator.name}: ${validator.stakerAddress}`);
}
// Also available: sepoliaValidators

// Get all stakeable tokens
const tokens = await sdk.stakingTokens();
console.log(tokens.map((t) => t.symbol)); // ["STRK", ...]

// Get pools for a specific validator
const pools = await sdk.getStakerPools(validator.stakerAddress);
for (const pool of pools) {
  console.log(`${pool.token.symbol}: ${pool.amount.toFormatted()} delegated`);
  console.log(`Pool contract: ${pool.poolContract}`);
}
```

### Entering a Pool

Stake tokens for the first time in a validator's pool. The SDK handles the token approval automatically.

```typescript
const tx = await wallet.enterPool(poolAddress, Amount.parse("100", STRK));
await tx.wait();
```

### Adding to an Existing Stake

If you're already a pool member, add more tokens:

```typescript
const tx = await wallet.addToPool(poolAddress, Amount.parse("50", STRK));
await tx.wait();
```

### Claiming Rewards

```typescript
const position = await wallet.getPoolPosition(poolAddress);

if (position && !position.rewards.isZero()) {
  const tx = await wallet.claimPoolRewards(poolAddress);
  await tx.wait();
  console.log(`Claimed ${position.rewards.toFormatted()}`);
}
```

### Exiting a Pool (Two-Step)

Exiting a pool is a two-step process with an exit window:

```typescript
// Step 1: Declare exit intent — tokens stop earning rewards immediately
const tx = await wallet.exitPoolIntent(poolAddress, Amount.parse("50", STRK));
await tx.wait();

// Step 2: Wait for exit window, then complete the withdrawal
const position = await wallet.getPoolPosition(poolAddress);
if (position?.unpoolTime && new Date() >= position.unpoolTime) {
  const tx = await wallet.exitPool(poolAddress);
  await tx.wait();
  console.log("Tokens returned to wallet");
}
```

### Querying Position

```typescript
const position = await wallet.getPoolPosition(poolAddress);

if (position) {
  console.log(`Staked:     ${position.staked.toFormatted()}`);
  console.log(`Rewards:    ${position.rewards.toFormatted()}`);
  console.log(`Total:      ${position.total.toFormatted()}`);
  console.log(`Commission: ${position.commissionPercent}%`);
  console.log(`Unpooling:  ${position.unpooling.toFormatted()}`);
  console.log(`Unpool at:  ${position.unpoolTime}`);
}

// Check membership
const isMember = await wallet.isPoolMember(poolAddress);

// Get commission without full position
const commission = await wallet.getPoolCommission(poolAddress);
```

---

## Transaction Builder

The `TxBuilder` provides a fluent API for batching multiple operations into a single atomic transaction. This saves gas and guarantees all-or-nothing execution.

### Basic Usage

```typescript
const tx = await wallet
  .tx()
  .enterPool(poolAddress, Amount.parse("100", STRK))
  .send();
await tx.wait();
```

### Mixing Operations

Combine transfers, staking, approvals, and raw calls:

```typescript
const tx = await wallet
  .tx()
  // Transfer tokens to multiple recipients
  .transfer(USDC, [
    { to: alice, amount: Amount.parse("50", USDC) },
    { to: bob, amount: Amount.parse("25", USDC) },
  ])
  // Stake in a pool (auto-detects enter vs. add)
  .stake(poolAddress, Amount.parse("100", STRK))
  // Claim rewards
  .claimPoolRewards(anotherPoolAddress)
  // Add raw contract calls
  .add({
    contractAddress: "0xDEX_CONTRACT",
    entrypoint: "swap",
    calldata: [
      /* ... */
    ],
  })
  .send();

await tx.wait();
```

The `.stake()` method is smart — it automatically calls `enter_delegation_pool` for new members or `add_to_delegation_pool` for existing members.

### Preflight Simulation

Simulate the transaction before sending to check for errors:

```typescript
const builder = wallet
  .tx()
  .stake(poolAddress, amount)
  .transfer(USDC, { to: alice, amount: usdcAmount });

const result = await builder.preflight();
if (!result.ok) {
  console.error("Transaction would fail:", result.reason);
} else {
  const tx = await builder.send();
  await tx.wait();
}
```

### Fee Estimation

```typescript
const fee = await wallet
  .tx()
  .transfer(USDC, { to: alice, amount })
  .stake(poolAddress, stakeAmount)
  .estimateFee();

console.log("Estimated fee:", fee.overall_fee);
```

You can also extract the raw calls for inspection:

```typescript
const calls = await wallet
  .tx()
  .transfer(USDC, { to: alice, amount })
  .enterPool(poolAddress, stakeAmount)
  .calls();

console.log(`${calls.length} calls in this transaction`);
```

**Available builder methods:**

| Method                             | Description                                    |
| ---------------------------------- | ---------------------------------------------- |
| `.add(...calls)`                   | Add raw `Call` objects                         |
| `.approve(token, spender, amount)` | ERC20 approval                                 |
| `.transfer(token, transfers)`      | ERC20 transfer(s)                              |
| `.stake(pool, amount)`             | Smart stake (enter or add based on membership) |
| `.enterPool(pool, amount)`         | Enter pool as new member                       |
| `.addToPool(pool, amount)`         | Add to existing pool position                  |
| `.claimPoolRewards(pool)`          | Claim staking rewards                          |
| `.exitPoolIntent(pool, amount)`    | Start exit process                             |
| `.exitPool(pool)`                  | Complete exit after window                     |
| `.calls()`                         | Resolve all calls without sending              |
| `.estimateFee()`                   | Estimate gas cost                              |
| `.preflight()`                     | Simulate the transaction                       |
| `.send(options?)`                  | Execute all calls atomically                   |

---

## Addresses

The SDK uses a branded `Address` type for compile-time safety:

```typescript
import { fromAddress, type Address } from "x";

// Parse and validate an address
const address: Address = fromAddress(
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
);

// Use in transfers, staking, etc.
const tx = await wallet.transfer(STRK, [
  { to: address, amount: Amount.parse("10", STRK) },
]);
```

---

## Chain IDs

```typescript
import { ChainId } from "x";

// Static instances
const mainnet = ChainId.MAINNET; // SN_MAIN
const sepolia = ChainId.SEPOLIA; // SN_SEPOLIA

// Create from string literal
const chain = ChainId.from("SN_MAIN");

// Create from on-chain felt252 (e.g., from provider.getChainId())
const chain = ChainId.fromFelt252("0x534e5f4d41494e");

// Query
chain.isMainnet(); // true
chain.isSepolia(); // false
chain.toFelt252(); // "0x534e5f4d41494e"
chain.toLiteral(); // "SN_MAIN"

// Detect from provider
import { getChainId } from "x";
const chainId = await getChainId(provider);
```

---

## React Native Setup

For React Native / Expo, ensure required runtime polyfills are installed and loaded by your app (for example random values and text encoding shims).

Required optional peer dependencies for React Native:

```bash
npm install react-native-get-random-values fast-text-encoding @ethersproject/shims
```

---

## API Reference

### `StarkSDK`

| Method                       | Returns                    | Description                          |
| ---------------------------- | -------------------------- | ------------------------------------ |
| `new StarkSDK(config)`       | `StarkSDK`                 | Create SDK instance                  |
| `connectWallet(options)`     | `Promise<Wallet>`          | Connect with signer + account preset |
| `connectCartridge(options?)` | `Promise<CartridgeWallet>` | Connect via Cartridge Controller     |
| `stakingTokens()`            | `Promise<Token[]>`         | Get stakeable tokens                 |
| `getStakerPools(staker)`     | `Promise<Pool[]>`          | Get validator's delegation pools     |
| `getProvider()`              | `RpcProvider`              | Get the underlying RPC provider      |

### `Wallet` / `WalletInterface`

| Method                                   | Returns                        | Description                  |
| ---------------------------------------- | ------------------------------ | ---------------------------- |
| `address`                                | `Address`                      | Wallet address               |
| `isDeployed()`                           | `Promise<boolean>`             | Check deployment status      |
| `ensureReady(options?)`                  | `Promise<void>`                | Deploy if needed             |
| `deploy(options?)`                       | `Promise<Tx>`                  | Deploy account contract      |
| `execute(calls, options?)`               | `Promise<Tx>`                  | Execute contract calls       |
| `signMessage(typedData)`                 | `Promise<Signature>`           | Sign typed data              |
| `preflight(options)`                     | `Promise<PreflightResult>`     | Simulate transaction         |
| `tx()`                                   | `TxBuilder`                    | Create a transaction builder |
| `balanceOf(token)`                       | `Promise<Amount>`              | Get token balance            |
| `transfer(token, transfers, options?)`   | `Promise<Tx>`                  | Transfer ERC20 tokens        |
| `enterPool(pool, amount, options?)`      | `Promise<Tx>`                  | Enter staking pool           |
| `addToPool(pool, amount, options?)`      | `Promise<Tx>`                  | Add to existing stake        |
| `claimPoolRewards(pool, options?)`       | `Promise<Tx>`                  | Claim staking rewards        |
| `exitPoolIntent(pool, amount, options?)` | `Promise<Tx>`                  | Start exit process           |
| `exitPool(pool, options?)`               | `Promise<Tx>`                  | Complete exit                |
| `isPoolMember(pool)`                     | `Promise<boolean>`             | Check pool membership        |
| `getPoolPosition(pool)`                  | `Promise<PoolMember \| null>`  | Get staking position         |
| `getPoolCommission(pool)`                | `Promise<number>`              | Get pool commission rate     |
| `estimateFee(calls)`                     | `Promise<EstimateFeeResponse>` | Estimate execution fee       |
| `getAccount()`                           | `Account`                      | Get starknet.js Account      |
| `getProvider()`                          | `RpcProvider`                  | Get RPC provider             |
| `getChainId()`                           | `ChainId`                      | Get chain ID                 |
| `getFeeMode()`                           | `FeeMode`                      | Get default fee mode         |
| `disconnect()`                           | `Promise<void>`                | Disconnect wallet            |

### `Tx`

| Property/Method   | Returns              | Description             |
| ----------------- | -------------------- | ----------------------- |
| `hash`            | `string`             | Transaction hash        |
| `explorerUrl`     | `string`             | Block explorer URL      |
| `wait(options?)`  | `Promise<void>`      | Wait for confirmation   |
| `watch(callback)` | `TxUnsubscribe`      | Watch status changes    |
| `receipt()`       | `Promise<TxReceipt>` | Get transaction receipt |

### `Amount`

| Method                         | Returns               | Description                  |
| ------------------------------ | --------------------- | ---------------------------- |
| `Amount.parse(value, token)`   | `Amount`              | From human-readable value    |
| `Amount.fromRaw(value, token)` | `Amount`              | From raw blockchain value    |
| `toUnit()`                     | `string`              | Human-readable string        |
| `toBase()`                     | `bigint`              | Raw value for contracts      |
| `toFormatted(compressed?)`     | `string`              | Locale-formatted with symbol |
| `getDecimals()`                | `number`              | Token decimal places         |
| `getSymbol()`                  | `string \| undefined` | Token symbol                 |
| `add(other)`                   | `Amount`              | Addition                     |
| `subtract(other)`              | `Amount`              | Subtraction                  |
| `multiply(scalar)`             | `Amount`              | Multiplication               |
| `divide(scalar)`               | `Amount`              | Division                     |
| `eq(other)`                    | `boolean`             | Equal                        |
| `gt(other)`                    | `boolean`             | Greater than                 |
| `gte(other)`                   | `boolean`             | Greater than or equal        |
| `lt(other)`                    | `boolean`             | Less than                    |
| `lte(other)`                   | `boolean`             | Less than or equal           |
| `isZero()`                     | `boolean`             | Is zero                      |
| `isPositive()`                 | `boolean`             | Is positive                  |

### Signers

| Signer                    | Description                               |
| ------------------------- | ----------------------------------------- |
| `StarkSigner(privateKey)` | Local Stark curve signer                  |
| `PrivySigner(config)`     | Privy server-side key management          |
| Custom `SignerInterface`  | Implement `getPubKey()` + `signRaw(hash)` |

### Types

```typescript
type Address       // Branded string for Starknet addresses
type FeeMode       // "sponsored" | "user_pays"
type DeployMode    // "never" | "if_needed" | "always"

interface Token          { name, address, decimals, symbol, metadata? }
interface Pool           { poolContract, token, amount }
interface PoolMember     { staked, rewards, total, unpooling, unpoolTime, commissionPercent, rewardAddress }
interface Validator      { name, stakerAddress, logoUrl }
interface SDKConfig      { network?, rpcUrl?, chainId?, paymaster?, explorer?, staking? }
interface ExplorerConfig { provider?, baseUrl? }
interface StakingConfig  { contract }
```

---

## Examples

The repository includes three example applications:

### Web (`examples/web/`)

Vanilla TypeScript + Vite app demonstrating:

- Private key wallet connection
- Cartridge Controller integration
- Privy server-backed signing
- Sponsored transactions
- Raw contract calls

```bash
cd examples/web && npm install && npm run dev
```

### Mobile (`examples/mobile/`)

React Native + Expo app with full-featured UI:

- Balance checking across multiple tokens
- Single and batch ERC20 transfers
- Staking: enter/add/claim/exit delegation pools
- Transaction toasts with explorer links
- Network switching (Mainnet / Sepolia)

```bash
cd examples/mobile && npm install && npx expo start
```

### Server (`examples/server/`)

Express.js backend for Privy wallet operations:

- Wallet creation and registration
- Transaction signing endpoint
- AVNU Paymaster proxy

```bash
cd examples/server && npm install && npm start
```

---

## Contributing

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Run unit tests
npm test

# Run integration tests (requires starknet-devnet)
npm run test:integration

# Lint and format
npm run lint
npm run prettier

# Build
npm run build
```

### Generating Presets

Token and validator presets are auto-generated from on-chain data:

```bash
# Token presets
npm run generate:tokens            # mainnet
npm run generate:tokens:sepolia    # sepolia

# Validator presets
npm run generate:validators        # mainnet
npm run generate:validators:sepolia # sepolia
```

---

## License

[MIT](LICENSE) — 0xLucqs
