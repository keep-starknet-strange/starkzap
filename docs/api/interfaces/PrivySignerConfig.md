[**starkzap**](../README.md)

***

[starkzap](../globals.md) / PrivySignerConfig

# Interface: PrivySignerConfig

Defined in: [src/signer/privy.ts:20](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L20)

Configuration for the Privy signer.

You can either provide:
- `serverUrl`: URL to your backend's sign endpoint (simpler)
- `rawSign`: Custom signing function (flexible)

## Properties

### walletId

> **walletId**: `string`

Defined in: [src/signer/privy.ts:22](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L22)

Privy wallet ID

***

### publicKey

> **publicKey**: `string`

Defined in: [src/signer/privy.ts:24](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L24)

Public key returned by Privy when creating the wallet

***

### serverUrl?

> `optional` **serverUrl**: `string`

Defined in: [src/signer/privy.ts:30](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L30)

URL to your backend's sign endpoint.
The signer will POST { walletId, hash } and expect { signature } back.

#### Example

```ts
"https://my-server.com/api/wallet/sign"
```

***

### rawSign()?

> `optional` **rawSign**: (`walletId`, `messageHash`) => `Promise`\<`string`\>

Defined in: [src/signer/privy.ts:35](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L35)

Custom function to call Privy's rawSign.
Use this for server-side signing with PrivyClient directly.

#### Parameters

##### walletId

`string`

##### messageHash

`string`

#### Returns

`Promise`\<`string`\>

***

### headers?

> `optional` **headers**: `PrivySigningHeaders`

Defined in: [src/signer/privy.ts:41](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L41)

Optional headers (or header factory) for authenticated signing requests.

Use this to pass session/JWT headers when calling your backend endpoint.

***

### buildBody?

> `optional` **buildBody**: `PrivySigningBody`

Defined in: [src/signer/privy.ts:47](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L47)

Optional payload builder for challenge/nonce aware signing endpoints.

Default body is `{ walletId, hash }`.

***

### requestTimeoutMs?

> `optional` **requestTimeoutMs**: `number`

Defined in: [src/signer/privy.ts:52](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/signer/privy.ts#L52)

Timeout for serverUrl requests in milliseconds.

#### Default

```ts
10000
```
