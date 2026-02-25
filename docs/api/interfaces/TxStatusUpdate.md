[**x**](../README.md)

---

[x](../globals.md) / TxStatusUpdate

# Interface: TxStatusUpdate

Defined in: [src/types/tx.ts:19](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/tx.ts#L19)

Status update emitted by `tx.watch()`.
Uses starknet.js status values.

## Properties

### finality

> **finality**: `TXN_STATUS`

Defined in: [src/types/tx.ts:21](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/tx.ts#L21)

Current finality status

---

### execution

> **execution**: `ETransactionExecutionStatus` \| `undefined`

Defined in: [src/types/tx.ts:23](https://github.com/keep-starknet-strange/starkzap/blob/a5957e5a6aebb4214574da0d6c8fb4a586de1aa2/src/types/tx.ts#L23)

Execution status (SUCCEEDED or REVERTED), if available
