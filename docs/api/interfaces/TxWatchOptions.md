[**starkzap**](../README.md)

***

[starkzap](../globals.md) / TxWatchOptions

# Interface: TxWatchOptions

Defined in: [src/types/tx.ts:30](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L30)

Options for `tx.watch()` polling behavior.

## Properties

### pollIntervalMs?

> `optional` **pollIntervalMs**: `number`

Defined in: [src/types/tx.ts:32](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L32)

Poll interval in milliseconds (default: 5000).

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: [src/types/tx.ts:38](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L38)

Maximum watch duration in milliseconds before auto-stop.
Set to `0` to disable timeout.

#### Default

```ts
600000 (10 minutes)
```

***

### onError()?

> `optional` **onError**: (`error`) => `void`

Defined in: [src/types/tx.ts:40](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L40)

Optional callback for recoverable polling errors or timeout.

#### Parameters

##### error

`Error`

#### Returns

`void`
