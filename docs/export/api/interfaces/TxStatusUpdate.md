[**starkzap**](../README.md)

***

[starkzap](../globals.md) / TxStatusUpdate

# Interface: TxStatusUpdate

Defined in: [src/types/tx.ts:19](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L19)

Status update emitted by `tx.watch()`.
Uses starknet.js status values.

## Properties

### finality

> **finality**: `TXN_STATUS`

Defined in: [src/types/tx.ts:21](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L21)

Current finality status

***

### execution

> **execution**: `ETransactionExecutionStatus` \| `undefined`

Defined in: [src/types/tx.ts:23](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/tx.ts#L23)

Execution status (SUCCEEDED or REVERTED), if available
