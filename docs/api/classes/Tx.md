[**x**](../README.md)

---

[x](../globals.md) / Tx

# Class: Tx

Defined in: [src/tx/index.ts:34](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L34)

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

Defined in: [src/tx/index.ts:43](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L43)

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

Defined in: [src/tx/index.ts:36](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L36)

Transaction hash

---

### explorerUrl

> `readonly` **explorerUrl**: `string`

Defined in: [src/tx/index.ts:38](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L38)

URL to view transaction on block explorer

## Methods

### wait()

> **wait**(`options?`): `Promise`\<`void`\>

Defined in: [src/tx/index.ts:72](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L72)

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

---

### watch()

> **watch**(`callback`): [`TxUnsubscribe`](../type-aliases/TxUnsubscribe.md)

Defined in: [src/tx/index.ts:104](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L104)

Watch transaction status changes in real-time.

Polls the transaction status and calls the callback whenever the
finality status changes. Automatically stops when the transaction
reaches a final state (accepted or reverted).

#### Parameters

##### callback

[`TxWatchCallback`](../type-aliases/TxWatchCallback.md)

Called on each status change with `{ finality, execution }`

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

---

### receipt()

> **receipt**(): `Promise`\<[`TxReceipt`](../type-aliases/TxReceipt.md)\>

Defined in: [src/tx/index.ts:154](https://github.com/keep-starknet-strange/x/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/tx/index.ts#L154)

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
