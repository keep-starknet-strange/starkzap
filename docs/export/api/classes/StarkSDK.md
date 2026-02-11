[**x**](../README.md)

---

[x](../globals.md) / StarkSDK

# Class: StarkSDK

Defined in: [src/sdk.ts:59](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L59)

Main SDK class for Starknet wallet integration.

## Example

```ts
import { StarkSDK, StarkSigner, ArgentPreset } from "x";

// Using network presets (recommended)
const sdk = new StarkSDK({ network: "mainnet" });
const sdk = new StarkSDK({ network: "sepolia" });

// Or with custom RPC
const sdk = new StarkSDK({
  rpcUrl: "https://my-rpc.example.com",
  chainId: ChainId.MAINNET,
});

// Connect with default account (OpenZeppelin)
const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) },
});

// Use the wallet
await wallet.ensureReady({ deploy: "if_needed" });
const tx = await wallet.execute([...]);
await tx.wait();
```

## Constructors

### Constructor

> **new StarkSDK**(`config`): `StarkSDK`

Defined in: [src/sdk.ts:63](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L63)

#### Parameters

##### config

[`SDKConfig`](../interfaces/SDKConfig.md)

#### Returns

`StarkSDK`

## Methods

### connectWallet()

> **connectWallet**(`options`): `Promise`\<[`Wallet`](Wallet.md)\>

Defined in: [src/sdk.ts:147](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L147)

Connect a wallet using the specified signer and account configuration.

#### Parameters

##### options

[`ConnectWalletOptions`](../interfaces/ConnectWalletOptions.md)

#### Returns

`Promise`\<[`Wallet`](Wallet.md)\>

#### Example

```ts
import { StarkSigner, OpenZeppelinPreset, ArgentPreset } from "x";

// Default: OpenZeppelin account
const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) },
});

// With Argent preset
const wallet = await sdk.connectWallet({
  account: {
    signer: new StarkSigner(privateKey),
    accountClass: ArgentPreset,
  },
});

// With custom account class
const wallet = await sdk.connectWallet({
  account: {
    signer: new StarkSigner(privateKey),
    accountClass: {
      classHash: "0x...",
      buildConstructorCalldata: (pk) => [pk, "0x0"],
    },
  },
});

// With sponsored transactions
const wallet = await sdk.connectWallet({
  account: { signer: new StarkSigner(privateKey) },
  feeMode: "sponsored",
});
```

---

### onboard()

> **onboard**(`options`): `Promise`\<[`OnboardResult`](../interfaces/OnboardResult.md)\<[`WalletInterface`](../interfaces/WalletInterface.md)\>\>

Defined in: [src/sdk.ts:187](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L187)

High-level onboarding API for app integrations.

Strategy behaviors:

- `signer`: connect with a provided signer/account config
- `privy`: resolve Privy auth context, then connect via PrivySigner
- `cartridge`: connect via Cartridge Controller
- `webauthn`: reserved for upcoming native WebAuthn signer support

By default, onboarding calls `wallet.ensureReady({ deploy: "if_needed" })`.

#### Parameters

##### options

[`OnboardOptions`](../type-aliases/OnboardOptions.md)

#### Returns

`Promise`\<[`OnboardResult`](../interfaces/OnboardResult.md)\<[`WalletInterface`](../interfaces/WalletInterface.md)\>\>

---

### connectCartridge()

> **connectCartridge**(`options?`): `Promise`\<[`CartridgeWallet`](CartridgeWallet.md)\>

Defined in: [src/sdk.ts:307](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L307)

Connect using Cartridge Controller.

Opens the Cartridge authentication popup for social login or passkeys.
Returns a CartridgeWallet that implements WalletInterface.

#### Parameters

##### options?

`Omit`\<[`CartridgeWalletOptions`](../interfaces/CartridgeWalletOptions.md), `"rpcUrl"` \| `"chainId"`\> = `{}`

#### Returns

`Promise`\<[`CartridgeWallet`](CartridgeWallet.md)\>

#### Example

```ts
const wallet = await sdk.connectCartridge({
  policies: [
    { target: "0xCONTRACT", method: "transfer" }
  ]
});

// Use just like any other wallet
await wallet.execute([...]);

// Access Cartridge-specific features
const controller = wallet.getController();
controller.openProfile();
```

---

### stakingTokens()

> **stakingTokens**(): `Promise`\<[`Token`](../interfaces/Token.md)[]\>

Defined in: [src/sdk.ts:338](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L338)

Get all tokens that are currently enabled for staking.

Returns the list of tokens that can be staked in the protocol.
Typically includes STRK and may include other tokens.

#### Returns

`Promise`\<[`Token`](../interfaces/Token.md)[]\>

Array of tokens that can be staked

#### Throws

Error if staking is not configured in the SDK config

#### Example

```ts
const tokens = await sdk.stakingTokens();
console.log(`Stakeable tokens: ${tokens.map((t) => t.symbol).join(", ")}`);
// Output: "Stakeable tokens: STRK, BTC"
```

---

### getStakerPools()

> **getStakerPools**(`staker`): `Promise`\<[`Pool`](../interfaces/Pool.md)[]\>

Defined in: [src/sdk.ts:365](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L365)

Get all delegation pools managed by a specific validator.

Validators can have multiple pools, one for each supported token.
Use this to discover what pools a validator offers and their current
delegation amounts.

#### Parameters

##### staker

[`Address`](../type-aliases/Address.md)

The validator's staker address

#### Returns

`Promise`\<[`Pool`](../interfaces/Pool.md)[]\>

Array of pools with their contract addresses, tokens, and amounts

#### Throws

Error if staking is not configured in the SDK config

#### Example

```ts
const pools = await sdk.getStakerPools(validatorAddress);
for (const pool of pools) {
  console.log(`${pool.token.symbol}: ${pool.amount.toFormatted()} delegated`);
}
```

---

### getProvider()

> **getProvider**(): `RpcProvider`

Defined in: [src/sdk.ts:380](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/sdk.ts#L380)

Get the underlying RPC provider.

#### Returns

`RpcProvider`
