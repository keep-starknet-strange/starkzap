[**starkzap**](../README.md)

***

[starkzap](../globals.md) / PrivySigner

# Class: PrivySigner

Defined in: [src/signer/privy.ts:120](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L120)

Privy-based signer for Starknet.

This signer delegates signing to Privy's secure key management.
Privy holds the private key and you call their rawSign endpoint.

## See

https://docs.privy.io/recipes/use-tier-2#starknet

## Example

```ts
// Option 1: Simple - provide your backend URL (recommended for mobile/web)
const signer = new PrivySigner({
  walletId: wallet.id,
  publicKey: wallet.public_key,
  serverUrl: "https://my-server.com/api/wallet/sign",
});

// Option 2: Custom signing function (for server-side with PrivyClient)
const signer = new PrivySigner({
  walletId: wallet.id,
  publicKey: wallet.public_key,
  rawSign: async (walletId, messageHash) => {
    const response = await privyClient.wallets().rawSign(walletId, {
      params: { hash: messageHash }
    });
    return response.signature;
  }
});

// Use with the SDK
const sdk = new StarkSDK({ rpcUrl: '...', chainId: ChainId.SEPOLIA });
const wallet = await sdk.connectWallet({
  account: { signer, accountClass: ArgentPreset }
});
```

## Implements

- [`SignerInterface`](../interfaces/SignerInterface.md)

## Constructors

### Constructor

> **new PrivySigner**(`config`): `PrivySigner`

Defined in: [src/signer/privy.ts:128](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L128)

#### Parameters

##### config

[`PrivySignerConfig`](../interfaces/PrivySignerConfig.md)

#### Returns

`PrivySigner`

## Methods

### getPubKey()

> **getPubKey**(): `Promise`\<`string`\>

Defined in: [src/signer/privy.ts:246](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L246)

Get the public key.

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`SignerInterface`](../interfaces/SignerInterface.md).[`getPubKey`](../interfaces/SignerInterface.md#getpubkey)

***

### signRaw()

> **signRaw**(`hash`): `Promise`\<`Signature`\>

Defined in: [src/signer/privy.ts:250](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L250)

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
