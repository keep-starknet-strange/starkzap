[**starkzap**](../README.md)

***

[starkzap](../globals.md) / AccountClassConfig

# Interface: AccountClassConfig

Defined in: [src/types/wallet.ts:25](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L25)

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

Defined in: [src/types/wallet.ts:27](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L27)

Account contract class hash

***

### buildConstructorCalldata()

> **buildConstructorCalldata**: (`publicKey`) => `Calldata`

Defined in: [src/types/wallet.ts:29](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L29)

Build constructor calldata from public key

#### Parameters

##### publicKey

`string`

#### Returns

`Calldata`

***

### getSalt()?

> `optional` **getSalt**: (`publicKey`) => `string`

Defined in: [src/types/wallet.ts:36](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L36)

Compute the salt for address computation.
Default: uses public key directly (for Stark curve accounts).
Override for non-Stark curves (e.g., P-256/WebAuthn) where the public key
is too large for Pedersen hash.

#### Parameters

##### publicKey

`string`

#### Returns

`string`
