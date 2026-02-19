[**starkzap**](../README.md)

***

[starkzap](../globals.md) / Tx

# Class: Tx

Defined in: [src/tx/index.ts:37](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L37)

Represents a submitted Starknet transaction.
Provides methods to wait for confirmation, watch status changes, and get receipts.

## Example

```ts
const tx = await wallet.execute(calls);
console.log(tx.explorerUrl);

// Wait for L2 acceptance
await tx.wait({
  successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
});

const receipt = await tx.receipt();
```

## Constructors

### Constructor

> **new Tx**(`hash`, `provider`, `chainId`, `explorerConfig?`): `Tx`

Defined in: [src/tx/index.ts:46](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L46)

#### Parameters

##### hash

`string`

##### provider

`RpcProvider`

##### chainId

[`ChainId`](ChainId.md)

##### explorerConfig?

[`ExplorerConfig`](../interfaces/ExplorerConfig.md)

#### Returns

`Tx`

## Properties

### hash

> `readonly` **hash**: `string`

Defined in: [src/tx/index.ts:39](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L39)

Transaction hash

***

### explorerUrl

> `readonly` **explorerUrl**: `string`

Defined in: [src/tx/index.ts:41](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L41)

URL to view transaction on block explorer

## Methods

### wait()

> **wait**(`options?`): `Promise`\<`void`\>

Defined in: [src/tx/index.ts:75](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L75)

Wait for the transaction to reach a target status.
Wraps starknet.js `waitForTransaction`.

#### Parameters

##### options?

[`WaitOptions`](../type-aliases/WaitOptions.md)

Optional overrides for success/error states and retry interval

#### Returns

`Promise`\<`void`\>

#### Throws

Error if transaction is reverted or reaches an error state

#### Example

```ts
// Wait for L2 acceptance (default)
await tx.wait();

// Wait for L1 finality
await tx.wait({
  successStates: [TransactionFinalityStatus.ACCEPTED_ON_L1],
});
```

***

### watch()

> **watch**(`callback`, `options?`): [`TxUnsubscribe`](../type-aliases/TxUnsubscribe.md)

Defined in: [src/tx/index.ts:107](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L107)

Watch transaction status changes in real-time.

Polls the transaction status and calls the callback whenever the
finality status changes. Automatically stops when the transaction
reaches a final state (accepted or reverted).

#### Parameters

##### callback

[`TxWatchCallback`](../type-aliases/TxWatchCallback.md)

Called on each status change with `{ finality, execution }`

##### options?

[`TxWatchOptions`](../interfaces/TxWatchOptions.md) = `{}`

#### Returns

[`TxUnsubscribe`](../type-aliases/TxUnsubscribe.md)

Unsubscribe function — call it to stop watching early

#### Example

```ts
const unsubscribe = tx.watch(({ finality, execution }) => {
  console.log(`Status: ${finality} (${execution})`);
});

// Stop watching early if needed
unsubscribe();
```

***

### receipt()

> **receipt**(): `Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

Defined in: [src/tx/index.ts:182](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/tx/index.ts#L182)

Get the full transaction receipt.

The result is cached after the first successful fetch, so subsequent
calls return immediately without an RPC round-trip.

#### Returns

`Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

The transaction receipt

#### Example

```ts
await tx.wait();
const receipt = await tx.receipt();
console.log("Fee paid:", receipt.actual_fee);
```
