[**starkzap**](../README.md)

***

[starkzap](../globals.md) / StarkSigner

# Class: StarkSigner

Defined in: [src/signer/stark.ts:12](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/stark.ts#L12)

Standard Stark curve signer using a private key.

## Example

```ts
const signer = new StarkSigner("0xPRIVATE_KEY");
```

## Implements

- [`SignerInterface`](../interfaces/SignerInterface.md)

## Constructors

### Constructor

> **new StarkSigner**(`privateKey`): `StarkSigner`

Defined in: [src/signer/stark.ts:16](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/stark.ts#L16)

#### Parameters

##### privateKey

`string`

#### Returns

`StarkSigner`

## Methods

### getPubKey()

> **getPubKey**(): `Promise`\<`string`\>

Defined in: [src/signer/stark.ts:21](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/stark.ts#L21)

Get the public key.

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`SignerInterface`](../interfaces/SignerInterface.md).[`getPubKey`](../interfaces/SignerInterface.md#getpubkey)

***

### signRaw()

> **signRaw**(`hash`): `Promise`\<`Signature`\>

Defined in: [src/signer/stark.ts:25](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/stark.ts#L25)

Sign a raw message hash.
This is the core signing primitive - all transaction signing ultimately calls this.

#### Parameters

##### hash

`string`

The message hash to sign (hex string with 0x prefix)

#### Returns

`Promise`\<`Signature`\>

The signature as [r, s] tuple

#### Implementation of

[`SignerInterface`](../interfaces/SignerInterface.md).[`signRaw`](../interfaces/SignerInterface.md#signraw)
