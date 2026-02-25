[**x**](../README.md)

---

[x](../globals.md) / EnsureReadyOptions

# Interface: EnsureReadyOptions

Defined in: [src/types/wallet.ts:137](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L137)

Options for `wallet.ensureReady()`.

## Example

```ts
await wallet.ensureReady({
  deploy: "if_needed",
  feeMode: "sponsored",
  onProgress: (e) => console.log(e.step),
});
```

## Properties

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: [src/types/wallet.ts:139](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L139)

When to deploy (default: "if_needed")

---

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:141](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L141)

How to pay for deployment if needed (default: wallet's default)

---

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: [src/types/wallet.ts:143](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/wallet.ts#L143)

Callback for progress updates

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`
