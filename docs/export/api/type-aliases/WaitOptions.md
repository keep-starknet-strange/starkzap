[**x**](../README.md)

---

[x](../globals.md) / WaitOptions

# Type Alias: WaitOptions

> **WaitOptions** = `object`

Defined in: node_modules/starknet/dist/index.d.ts:826

## Properties

### lifeCycleRetries?

> `optional` **lifeCycleRetries**: `number`

Defined in: node_modules/starknet/dist/index.d.ts:831

Define the number of retries before throwing an error for the transaction life cycle when the transaction is not found after it had a valid status.
This is useful for nodes that are not fully synced yet when connecting to service that rotate nodes.

---

### retries?

> `optional` **retries**: `number`

Defined in: node_modules/starknet/dist/index.d.ts:835

Define the number of retries before throwing an error

---

### retryInterval?

> `optional` **retryInterval**: `number`

Defined in: node_modules/starknet/dist/index.d.ts:839

Define the time interval between retries in milliseconds

---

### successStates?

> `optional` **successStates**: ([`TransactionFinalityStatus`](TransactionFinalityStatus.md) \| [`TransactionExecutionStatus`](TransactionExecutionStatus.md))[]

Defined in: node_modules/starknet/dist/index.d.ts:843

Define which states are considered as successful

---

### errorStates?

> `optional` **errorStates**: ([`TransactionFinalityStatus`](TransactionFinalityStatus.md) \| [`TransactionExecutionStatus`](TransactionExecutionStatus.md))[]

Defined in: node_modules/starknet/dist/index.d.ts:847

Define which states are considered as errors
