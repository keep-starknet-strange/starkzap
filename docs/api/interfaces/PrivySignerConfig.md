[**x**](../README.md)

---

[x](../globals.md) / PrivySignerConfig

# Interface: PrivySignerConfig

Defined in: [src/signer/privy.ts:11](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/signer/privy.ts#L11)

Configuration for the Privy signer.

You can either provide:

- `serverUrl`: URL to your backend's sign endpoint (simpler)
- `rawSign`: Custom signing function (flexible)

## Properties

### walletId

> **walletId**: `string`

Defined in: [src/signer/privy.ts:13](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/signer/privy.ts#L13)

Privy wallet ID

---

### publicKey

> **publicKey**: `string`

Defined in: [src/signer/privy.ts:15](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/signer/privy.ts#L15)

Public key returned by Privy when creating the wallet

---

### serverUrl?

> `optional` **serverUrl**: `string`

Defined in: [src/signer/privy.ts:21](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/signer/privy.ts#L21)

URL to your backend's sign endpoint.
The signer will POST { walletId, hash } and expect { signature } back.

#### Example

```ts
"https://my-server.com/api/wallet/sign";
```

---

### rawSign()?

> `optional` **rawSign**: (`walletId`, `messageHash`) => `Promise`\<`string`\>

Defined in: [src/signer/privy.ts:26](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/signer/privy.ts#L26)

Custom function to call Privy's rawSign.
Use this for server-side signing with PrivyClient directly.

#### Parameters

##### walletId

`string`

##### messageHash

`string`

#### Returns

`Promise`\<`string`\>
