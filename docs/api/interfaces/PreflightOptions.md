[**starkzap**](../README.md)

***

[starkzap](../globals.md) / PreflightOptions

# Interface: PreflightOptions

Defined in: [src/types/wallet.ts:178](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L178)

Options for `wallet.preflight()`.
Checks if an operation can succeed before attempting it.

## Properties

### calls

> **calls**: [`Call`](../type-aliases/Call.md)[]

Defined in: [src/types/wallet.ts:180](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L180)

The calls to simulate

***

### feeMode?

> `optional` **feeMode**: [`FeeMode`](../type-aliases/FeeMode.md)

Defined in: [src/types/wallet.ts:187](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/types/wallet.ts#L187)

Fee mode used for preflight assumptions.

When `"sponsored"` and the account is undeployed, preflight returns `{ ok: true }`
because the paymaster path can deploy + execute atomically.
