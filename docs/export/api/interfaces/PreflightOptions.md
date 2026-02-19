[**starkzap**](../README.md)

***

[starkzap](../globals.md) / PreflightOptions

# Interface: PreflightOptions

Defined in: [src/types/wallet.ts:173](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L173)

Options for `wallet.preflight()`.
Checks if an operation can succeed before attempting it.

## Properties

### calls

> **calls**: [`Call`](../type-aliases/Call.md)[]

Defined in: [src/types/wallet.ts:175](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L175)

The calls to simulate

***

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:182](https://github.com/keep-starknet-strange/x/blob/5e54d8974744c392df7cac56b636788dfe6ae268/src/types/wallet.ts#L182)

Fee mode used for preflight assumptions.

When `"sponsored"` and the account is undeployed, preflight returns `{ ok: true }`
because the paymaster path can deploy + execute atomically.
