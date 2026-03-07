[**starkzap**](../README.md)

***

[starkzap](../globals.md) / TxWatchOptions

# Interface: TxWatchOptions

Defined in: [src/types/tx.ts:30](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/tx.ts#L30)

Options for `tx.watch()` polling behavior.

## Properties

### pollIntervalMs?

> `optional` **pollIntervalMs**: `number`

Defined in: [src/types/tx.ts:32](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/tx.ts#L32)

Poll interval in milliseconds (default: 5000).

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: [src/types/tx.ts:38](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/tx.ts#L38)

Maximum watch duration in milliseconds before auto-stop.
Set to `0` to disable timeout.

#### Default

```ts
600000 (10 minutes)
```

***

### onError()?

> `optional` **onError**: (`error`) => `void`

Defined in: [src/types/tx.ts:40](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/tx.ts#L40)

Optional callback for recoverable polling errors or timeout.

#### Parameters

##### error

`Error`

#### Returns

`void`
