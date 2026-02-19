[**starkzap**](../README.md)

***

[starkzap](../globals.md) / EnsureReadyOptions

# Interface: EnsureReadyOptions

Defined in: [src/types/wallet.ts:138](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L138)

Options for `wallet.ensureReady()`.

## Example

```ts
await wallet.ensureReady({
  deploy: "if_needed",
  feeMode: "sponsored",
  onProgress: (e) => console.log(e.step)
});
```

## Properties

### deploy?

> `optional` **deploy**: [`DeployMode`](../type-aliases/DeployMode.md)

Defined in: [src/types/wallet.ts:140](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L140)

When to deploy (default: "if_needed")

***

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:142](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L142)

How to pay for deployment if needed (default: wallet's default)

***

### onProgress()?

> `optional` **onProgress**: (`event`) => `void`

Defined in: [src/types/wallet.ts:144](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L144)

Callback for progress updates

#### Parameters

##### event

[`ProgressEvent`](ProgressEvent.md)

#### Returns

`void`
