[**starkzap**](../README.md)

***

[starkzap](../globals.md) / AccountClassConfig

# Interface: AccountClassConfig

Defined in: [src/types/wallet.ts:26](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L26)

Configuration for an account contract class.
Use presets like `OpenZeppelinPreset` or define your own.

## Example

```ts
// Use a preset
import { OpenZeppelinPreset } from "starkzap";
{ accountClass: OpenZeppelinPreset }

// Or define custom
{
  accountClass: {
    classHash: "0x...",
    buildConstructorCalldata: (pk) => [pk, "0x0"],
  }
}
```

## Properties

### classHash

> **classHash**: `string`

Defined in: [src/types/wallet.ts:28](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L28)

Account contract class hash

***

### buildConstructorCalldata()

> **buildConstructorCalldata**: (`publicKey`) => `Calldata`

Defined in: [src/types/wallet.ts:30](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L30)

Build constructor calldata from public key

#### Parameters

##### publicKey

`string`

#### Returns

`Calldata`

***

### getSalt()?

> `optional` **getSalt**: (`publicKey`) => `string`

Defined in: [src/types/wallet.ts:37](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L37)

Compute the salt for address computation.
Default: uses public key directly (for Stark curve accounts).
Override for non-Stark curves (e.g., P-256/WebAuthn) where the public key
is too large for Pedersen hash.

#### Parameters

##### publicKey

`string`

#### Returns

`string`
