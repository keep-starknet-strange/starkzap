[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SignerInterface

# Interface: SignerInterface

Defined in: [src/signer/interface.ts:13](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/interface.ts#L13)

Signer interface for the SDK.
Implement this to create custom signers (hardware wallets, MPC, Privy, etc.)

Only requires implementing two methods:
- `getPubKey()` - returns the public key
- `signRaw(hash)` - signs a message hash and returns the signature

The SDK uses `SignerAdapter` to bridge this interface with starknet.js internally.

## Methods

### getPubKey()

> **getPubKey**(): `Promise`\<`string`\>

Defined in: [src/signer/interface.ts:17](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/interface.ts#L17)

Get the public key.

#### Returns

`Promise`\<`string`\>

***

### signRaw()

> **signRaw**(`hash`): `Promise`\<`Signature`\>

Defined in: [src/signer/interface.ts:26](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/interface.ts#L26)

Sign a raw message hash.
This is the core signing primitive - all transaction signing ultimately calls this.

#### Parameters

##### hash

`string`

The message hash to sign (hex string with 0x prefix)

#### Returns

`Promise`\<`Signature`\>

The signature as [r, s] tuple
