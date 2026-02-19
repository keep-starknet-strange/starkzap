[**starkzap**](../README.md)

***

[starkzap](../globals.md) / StarkSDK

# Class: StarkSDK

Defined in: [src/sdk.ts:79](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L79)

Main SDK class for Starknet wallet integration.

## Example

```ts
import { StarkSDK, StarkSigner, ArgentPreset } from "starkzap";

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

Defined in: [src/sdk.ts:84](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L84)

#### Parameters

##### config

[`SDKConfig`](../interfaces/SDKConfig.md)

#### Returns

`StarkSDK`

## Methods

### connectWallet()

> **connectWallet**(`options`): `Promise`\<[`Wallet`](Wallet.md)\>

Defined in: [src/sdk.ts:208](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L208)

Connect a wallet using the specified signer and account configuration.

#### Parameters

##### options

[`ConnectWalletOptions`](../interfaces/ConnectWalletOptions.md)

#### Returns

`Promise`\<[`Wallet`](Wallet.md)\>

#### Example

```ts
import { StarkSigner, OpenZeppelinPreset, ArgentPreset } from "starkzap";

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

***

### onboard()

> **onboard**(`options`): `Promise`\<[`OnboardResult`](../interfaces/OnboardResult.md)\<[`WalletInterface`](../interfaces/WalletInterface.md)\>\>

Defined in: [src/sdk.ts:248](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L248)

High-level onboarding API for app integrations.

Strategy behaviors:
- `signer`: connect with a provided signer/account config
- `privy`: resolve Privy auth context, then connect via PrivySigner
- `cartridge`: connect via Cartridge Controller

By default, onboarding calls `wallet.ensureReady({ deploy: "if_needed" })`.

#### Parameters

##### options

[`OnboardOptions`](../type-aliases/OnboardOptions.md)

#### Returns

`Promise`\<[`OnboardResult`](../interfaces/OnboardResult.md)\<[`WalletInterface`](../interfaces/WalletInterface.md)\>\>

***

### connectCartridge()

> **connectCartridge**(`options?`): `Promise`\<`CartridgeWalletInterface`\>

Defined in: [src/sdk.ts:372](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L372)

Connect using Cartridge Controller.

Opens the Cartridge authentication popup for social login or passkeys.
Returns a CartridgeWallet that implements WalletInterface.

#### Parameters

##### options?

`ConnectCartridgeOptions` = `{}`

#### Returns

`Promise`\<`CartridgeWalletInterface`\>

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

***

### stakingTokens()

> **stakingTokens**(): `Promise`\<[`Token`](../interfaces/Token.md)[]\>

Defined in: [src/sdk.ts:413](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L413)

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
console.log(`Stakeable tokens: ${tokens.map(t => t.symbol).join(', ')}`);
// Output: "Stakeable tokens: STRK, BTC"
```

***

### getStakerPools()

> **getStakerPools**(`staker`): `Promise`\<[`Pool`](../interfaces/Pool.md)[]\>

Defined in: [src/sdk.ts:436](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L436)

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

***

### getProvider()

> **getProvider**(): `RpcProvider`

Defined in: [src/sdk.ts:447](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L447)

Get the underlying RPC provider.

#### Returns

`RpcProvider`

***

### callContract()

> **callContract**(`call`): `Promise`\<`string`[]\>

Defined in: [src/sdk.ts:457](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/sdk.ts#L457)

Call a read-only contract entrypoint using the SDK provider.

This executes an RPC `call` without sending a transaction.
Useful before wallet connection or for app-level reads.

#### Parameters

##### call

[`Call`](../type-aliases/Call.md)

#### Returns

`Promise`\<`string`[]\>
