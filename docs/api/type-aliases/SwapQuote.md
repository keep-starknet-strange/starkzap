[**starkzap**](../README.md)

***

[starkzap](../globals.md) / SwapQuote

# Type Alias: SwapQuote

> **SwapQuote** = `object`

Defined in: [src/swap/interface.ts:7](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L7)

Common quote output shape for swap providers.

## Properties

### amountInBase

> **amountInBase**: `bigint`

Defined in: [src/swap/interface.ts:9](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L9)

Quoted input amount in token-in base units

***

### amountOutBase

> **amountOutBase**: `bigint`

Defined in: [src/swap/interface.ts:11](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L11)

Quoted output amount in token-out base units

***

### routeCallCount?

> `optional` **routeCallCount**: `number`

Defined in: [src/swap/interface.ts:13](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L13)

Optional number of Starknet calls required to execute the route

***

### priceImpactBps?

> `optional` **priceImpactBps**: `bigint` \| `null`

Defined in: [src/swap/interface.ts:15](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L15)

Optional price impact in basis points

***

### provider?

> `optional` **provider**: `string`

Defined in: [src/swap/interface.ts:17](https://github.com/adrienlacombe/starkzap/blob/93cc8acdf4b5a2f6d62f768f289d59b40af648f2/src/swap/interface.ts#L17)

Optional protocol/source identifier that produced the quote
